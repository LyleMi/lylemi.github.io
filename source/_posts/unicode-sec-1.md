---
title: 浅谈Unicode设计的安全性
date: 2019-06-18 22:41:40
categories: Misc
tags: Unicode
---

## 1. 简介

### 1.1 编码

在1963年，计算机使用尚不广泛，主要使用7-bit的ASCII编码（American Standard Code for Information Interchange，美国信息互换标准代码）来作为字符的编码，只支持常用的少数一些字符。但是随着计算机的不断普及，各个国家和地区开始制造自己的编码规范，同时互相不进行兼容，编码逐渐成为了一个问题。

<!--more-->

### 1.2 Unicode

而后ISO(International Organization for Standardization, 国际标准化组织) 开始尝试制定包含大部分字母和符号的编码，称为"Universal Multiple-Octet Coded Character Set"，简称UCS, 俗称Unicode。

Unicode实际上是一个字符和数字之间的映射关系表，并不制定实际的编码方案。因此又开始制定UTF(Unicode Transformation Formats)标准，包括UTF-8、UTF-16和UTF-32等。可以理解为Unicode是一个设计图，而UTF-X是其中一种实现。

### 1.3 Code Point 与 Code Unit

Code Point指Unicode标准里字符的编号，比如用目前Unicode使用了0 ~ 0x10FFFF的编码范围，通常用U+xxxx来表示某个字符。

Code Unit指某种Unicode编码方式里编码一个Code Point需要的最少字节数，比如UTF-8需要最少一个字节，UTF-16 最少两个字节，UCS-2两个字节，UCS-4和UTF-32四个字节，后面三个是定长编码。

## 2. 视觉欺骗

视觉欺骗问题是最常见的也是考虑最多的Unicode安全问题。视觉问题一般指几个不同的不同的字符在某个字体下看起来较为相同。可能是字符之间一对一相似、多个字符的组合字符和一个字符相似等，这种现象在字体较小的情况下会更加明显，在一些文章中这种问题也被称为同形异义词(homographs)问题。

### 2.1 国际化域名

国际化域名（Internationalized Domain Name，IDN）又称特殊字符域名，是指部分或完全使用特殊的文字或字母组成的互联网域名，包括中文、法语、阿拉伯语、希伯来语或拉丁字母等非英文字母，这些文字经多字节万国码编码而成。

因为浏览器对国家化域名的支持，这就使得可以出现 `аррӏе.com` (其中I是U+04CF) 这样的域名。在地址栏中，这样的域名看上去会和 `apple.com` 比较相似。

> 注: 这个例子在Chrome中已经被修复，但是Firefox中仍然生效。

同样在Url中，一些看上去和控制字符类似的Unicode也会造成问题，例如 `/` 和 `⁄` (U+2044)看起来就很相似，`example.com⁄evil.com` 实际上是 `com⁄evil.com` 的子域名。同样的 `?` / `.` / `#` 等类似字符也存在这样的问题。

除了上面提到的两种情况，punycode也是一种视觉欺骗的形式，punycode是域名的一种编码，会以 `xn--` 开头，后面是普通的有效域名，例如 `аррӏе.com` 对应的punycode就是 `xn--80ak6aa92e.com`。当chrome认为这是一个视觉问题时，就会主动把域名以punycode显示，以减少混淆的影响。但是反过来，也能应用这种方式来实现视觉欺骗，例如 `䕮䕵䕶䕱.com` 的punycode形式就是 `xn--google.com`。

### 2.2 双向显示

阿拉伯和希伯来语是从右往左阅读的，这在一些场景下可能造成问题。例如一个名为 ``txt.exe`` ，加入Unicode的控制字符后，在用户界面看起来是 `exe.txt` ，这样就有可能导致用户的误判。

### 2.3 数字显示

一些国家的数字在显示的时候也可能造成问题，例如孟加拉语的0-9是০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯，但是这里的৪ (U+09EA) 实际上是数字4。ASIS CTF 2019 的 [Unicorn Shop]((https://github.com/hyperreality/ctf-writeups/tree/master/2019-asis)) 也是从Unicode背后的数字角度出发考虑问题。

## 3. 非视觉漏洞

除了视觉漏洞之外，还有很多其他方面的漏洞。这些问题主要字符是转换导致的字符串。关于字符串处理转换的细节，可以参考我之前的这篇[文章](https://lylemi.github.io/2018/10/29/unicode-normalization/)。

### 3.1 等价形式

在WAF类处理，很容易想到的是 `LocalHost` 和 `localhost` 等同，但是 `ⓛocaⓛhost` 这种情景就不太容易被处理。在SSRF中的防御中，如果没有做对应的处理，这种替换就可以完成一些bypass。

### 3.2 字符删除

例如 `\x3c\x73\x63\x72\xc2\x69\x70\x74\x3e` 这个字符串中，而 `\xc2`  并不是任何一个有效字符的子串，在一些处理逻辑中，可能会删除 `\xc2` 这个字符，从而导致问题。

### 3.3 字符替换

一些情况下，字符会被替换为其他的字符 如U+FFFF会被替换成 `?` 这在一些 `?` 有明确语义的情况下就会出现问题。

### 3.4 缓冲区溢出

在一些大小写转换时，字符会变多，例如 `'ß'.toUpperCase()` 的运行结果是 `SS`。如果字符串的长度检查在大小写转换之前，就可能会存在缓冲区溢出问题。

## 4. 参考链接

+ [Unicode CLDR](http://cldr.unicode.org/)
+ [Unicode Security Considerations](http://www.unicode.org/reports/tr36/)
+ [Unicode Security Mechanisms](http://www.unicode.org/reports/tr39/)
+ [Unicode isn’t harmful for health – Unicode Myths debunked and encodings demystified](https://10kloc.wordpress.com/2013/08/25/plain-text-doesnt-exist-unicode-and-encodings-demystified/)
+ [Unicode Security Guide](https://websec.github.io/unicode-security-guide/)
+ [其实你并不懂 Unicode](https://zhuanlan.zhihu.com/p/53714077)
+ [IDN Spoof漏洞自动化挖掘](https://lylemi.github.io/2018/12/08/idnfuzz/)
+ [Unicode等价性浅谈](https://lylemi.github.io/2018/10/29/unicode-normalization/)
+ [Unicode Security Issues FAQ](http://www.unicode.org/faq/security.html)
+ [IDN Visual Security Deep Thinking](https://xlab.tencent.com/en/wp-content/uploads/2019/02/idn-visual-security-deep-thinking.pdf)
+ [ASIS CTF 2019 Unicorn Shop Write-up](https://github.com/hyperreality/ctf-writeups/tree/master/2019-asis)
+ [Black Hat](https://www.blackhat.com/presentations/bh-usa-09/WEBER/BHUSA09-Weber-UnicodeSecurityPreview-PAPER.pdf)
