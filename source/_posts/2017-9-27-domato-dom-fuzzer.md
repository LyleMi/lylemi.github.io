---
layout: post
title:  "Domato - A DOM Fuzzer"
date:   2017-09-27 09:31:40 +0800
categories: browser fuzz
---

### 0x00 概述

Domato是Google Project Zero的研究员实现的一套DOM Fuzz工具，该Fuzzer挖掘出了30+来自各浏览器的漏洞，是一款比较高效的Fuzzer。

其基本思路和正常的fuzzer一样，也是利用从各个地方抓取的HTML/CSS/JS样本中所包含的语法结构和属性来生成样本。

整个fuzzer大概可以分为以下几个部分：

- ``generator.py`` 根据输入的语法生成样本的引擎
- ``grammar.py`` 解析参数然后调用基础引擎来生成样本
- ``*.txt`` 用于生成HTML，CSS，js代码的语法库 

<!--more-->

### 0x01 代码

代码主要完成根据语法生成代码的功能，主要的代码是generator.py和grammar.py，另外的都是语法文件。

#### 语法

语法文件是domato的一个重要的部分，这部分作者提到的产生方式为两步。首先从Chrome的源文件中抽取出.idl文件，然后从Chrome的测试文件中提取出了一些常见的HTML和CSS语法。在提取出这些属性之后，还有很大范围的人工的改动，使得这些特征更容易触发bug。

完成后，作者并没有使用常见的json或者xml来定义，而是自己自定义了一种语法格式。其基本的语法是这样的：

```
<symbol> = a mix of constants and <other_symbol>s
```

每一条语法规则都包含一个左值和一个右值，左值是一个符号，右值是符号/常量及其组合。在生成样本时，右值都会递归的展开。

一个最简单的例子如下

```
<cssrule> = <selector> { <declaration> }
<selector> = a
<selector> = b
<declaration> = width:100%
```

这里可能生成的样本就是 ``a { width:100% }`` 或者 ``b { width:100% }``

这里在定义symbol的同时还可以定义一些附加的属性，比如

```
<selector p=0.9> = a
<selector p=0.1> = b
```

这里表示a出现的概率为0.1，如果不特别声明，则概率是相差不多的

#### 代码语法

用于生成代码的语法和普通的语法相差不大，但是引入了更多的规则来使得可以生成更灵活的脚本。还是看作者给出的例子

```
!varformat fuzzvar%05d
!lineguard try { <line> } catch(e) {}

!begin lines
<new element> = document.getElementById("<string min=97 max=122>");
<element>.doSomething();
!end lines
```

调用脚本生成一个5行的样本，得到的结果为

```javascript
try { var00001 = document.getElementById("hw"); } catch(e) {}
try { var00001.doSomething(); } catch(e) {}
try { var00002 = document.getElementById("feezcqbndf"); } catch(e) {}
try { var00002.doSomething(); } catch(e) {}
try { var00001.doSomething(); } catch(e) {}
```

写一个代码的语法规则要注意的是下面这些点：

- 每一行都由``!begin lines``和``!end lines``包裹
- 这里用了``<new element>``而不是``<element>``，表示生成了一个变量

#### generator.py

generator.py是主文件，其调用了grammar.py作为库，另外包含一些辅助生成样本的函数，大概的逻辑流程如下：

- GenerateSamples
    - read template and grammar files
        - add html grammar => html.txt
            - import css grammar
        - add js grammar => js.txt
            - import css grammar
        - add css grammar => css.txt
    - GenerateNewSample with args (template html css js)
        - AddHTMLIDs => 随机生成一些html元素的id，用于js/css
        - GenerateHTMLElements => 调用库生成html及css，保存相关信息
        - GenerateFunctionBody => 根据之前保存的信息生成js代码

#### grammar.py

grammar.py实现了一个通用的语法库，也就是说除了该fuzzer，还适用于其他的生成的库。其大概流程如下：

- ParseFromString => 读取文件
    - IncludeFromString => 保存规则
        - SaveFunction
        - ParseCodeLine
        - ParseGrammarLine
            - ParseTagAndAttributes
    - NormalizeProbabilities => 根据概率随机生成样本
        - GetCDF
    - ComputeInterestingIndices

其调用也比较简单，一个简单的demo如下

```python
from grammar import Grammar

my_grammar = Grammar()
my_grammar.ParseFromFile('input_file.txt')
result_string = my_grammar.GenerateSymbol('symbol_name')
```

这里就调用input_file.txt中的语法生成了symbol_name中的元素

### 0x02 参考链接

1. [pj0 blog](https://googleprojectzero.blogspot.com/2017/09/the-great-dom-fuzz-off-of-2017.html)

2. [github](https://github.com/google/domato)
