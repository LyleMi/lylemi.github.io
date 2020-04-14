---
title: 基于污点分析的XSS漏洞辅助挖掘的一种方式
date: 2019-06-12 10:37:07
categories: Web
tags:
    - XSS
    - 自动化
---

## 序

我在之前的一篇[文章](https://lylemi.github.io/2019/04/06/Web-Application-Auto-Audit/)中简单讲解了Web应用代码自动化审计的几种实现方式。

这篇文章以自动化辅助挖掘XSS漏洞漏洞为例，简单的讲解一个实际的灰盒分析实现的例子。

<!--more-->

在上文中有提到到，漏洞可以认为是输入到危险函数的过程，所以这篇文章涉及到的主要是输入、危险函数、具体实现这三个部分。

## 输入

作为污点来源的输入主要考虑当前状态、网络请求和存储函数三个来源。

当前状态主要指像窗口名、当前Url、Hash、referr等，具体对应如下这些变量：

- `window.name`
- `window.location.href`
- `window.location.search`
- `window.location.hash`
- `window.location.pathname`
- `window.location.url`
- `document.URL`
- `document.documentURI`
- `document.URLUnencoded`
- `document.baseURI`
- `document.referrer`

网络请求主要指使用异步方式获取的请求及其响应，这部分可以通过hook `XMLHttpRequest` `fetch` 等API来获取。

存储主要指Cookie、Indexdb、localStorage、sessionStorage等。

部分输入在网页初始化时已经确定，这部分由程序记录下来。部分输入会不断变化，如cookie等，这部分输入会通过插桩、事件处理等方式进行监控，并实时对变化进行记录。

## 危险函数

这里把危险函数分为直接执行JavaScript、加载URL、执行HTML、创建元素、部分可控执行五类，具体涉及到的函数与相关模式如下。

### 直接执行JavaScript

这类危险函数直接把输入以JavaScript代码的形式执行，例如。

- `eval(payload)`
- `setTimeout(payload, 100)`
- `setInterval(payload, 100)`
- `Function(payload)()`
- `<script>payload</script>`
- `<img src=x onerror=payload>`

### 加载URL

这类危险函数以URL加载的形式执行JavaScript代码，但是大体和JavaScript类似。

- `location=javascript:alert(/xss/)`
- `location.href=javascript:alert(/xss/)`
- `location.assign(javascript:alert(/xss/))`
- `location.replace(javascript:alert(/xss/))`

### 执行HTML

这类危险函数直接把输入以HTML代码的形式执行，在一定情况下可以执行代码。

- `xx.innerHTML=payload`
- `xx.outerHTML=payload`
- `document.write(payload)`
- `document.writeln(payload)`

### 创建元素

这类调用大多是创建一个DOM元素，并将其加入页面中。当script的源可控或者元素的构造可控的时候，可能会出现问题。

- `scriptElement.src`
- `domElement.appendChild`
- `domElement.insertBefore`
- `domElement.replaceChild`

### 部分可控执行

这类调用存在一定的动态成分，可控的程度不高，但是在部分情况下存在价值，因此在工具中加入了对其的监控。

- `(new Array()).reduce(func)`
- `(new Array()).reduceRight(func)`
- `(new Array()).map(func)`
- `(new Array()).filter(func)`

## 整体架构

### 污点追踪

污点追踪的实现有两种思路，一种思路是hook浏览器native的实现，但是这种方法要求对浏览器本身的实现机制有比较好的了解，而且编译过程复杂，很难迁移。浏览器一旦更新，就需要修改大量的代码来适应。

另外一种思路是基于浏览器插件做JavaScript层的Hook，这种方式虽然没有浏览器源代码层的hook底层，但是开发更快，更容易迁移，在有新的机制出现时也比较容易适应。

Chrome插件中，代码分在content-script、background、popup等运行时中。其中只有content-script可以操纵宿主页面的DOM，但是宿主页面JavaScript和content-script也在不同的沙箱中，无法hook，只能使用注入的方式。

在hook后，当出现危险函数的调用或网络请求时，则将其记录至后台。

### 疑似利用确认

和很多漏洞不同，大部分存储型的漏洞是没有回显的，因此需要做一定的确认工作。

在获取信息后，以域名为单位。遍历sink和source，查找重合的地方。如果source在sink的参数中出现，就可能是漏洞点。需要注意的是，除了hash之外，网络请求等各种参数不一定可控。另外，需要去除同一域名下，同一参数同一调用的Sink，同一源和同一返回的结果，减少重复数据。

在具体确认的时候，考虑到，sink中的参数可能是source的一部分，source中也可能只是sink的一部分，因此使用公共子字符串算法，只要字串的长度小于sink和source最小的长度。

不过即使完全可控，也可能出现waf、sanitizer、难以绕过的csp策略等。因此这种方法会有比较高的误报率，但是相对的，在hook较全的情况下，漏报率会小很多。

除了上面提到的这种方式，工具还采取了动态污染的方式。通过修改请求参数和修改函数调用时的参数两种方式，传入一些测试性的payload，如果在返回界面获取到了相信的结果，那么漏洞就是存在的。

### 结果查看

这里考虑过直接用插件自带的界面popup / background来显示可能的结果，用浏览器层的localstorge存储数据，但是考虑这种方式会影响浏览器间迁移的兼容性。

于是最后单独用vuejs + django编写了一个小的站点来接收请求，查看结果。

## 参考链接

+ [基于chrome扩展的脚本注入工具](https://zhuanlan.zhihu.com/p/27427557)
+ [让前端监控数据采集更高效](https://segmentfault.com/a/1190000018918875)
