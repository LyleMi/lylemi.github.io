---
title: nmap 小传：开源端扫三十年
date: 2024-04-05 08:21:06
tags: 杂谈
---

在网络安全领域，Nmap 无疑是一个具有传奇色彩的软件。自1997年问世以来，经过长期的功能优化，现已发展成为一个不可或缺的网络探测工具。这篇文章将不过多探讨技术细节，而是聊聊Nmap如何演变至今，以及这个长达二十多年的项目是如何构建和维持的。

<!--more-->

## 作者们

### Gordon Lyon

若需提及 Nmap 的主要作者，毫无疑问，应首推 Gordon Lyon。最初，Nmap 技术的细节由 Fyodor 在 Phrack 杂志的第51卷第11期（http://phrack.org/issues/51/11.html）中揭示。而在 Usenix 2016年对 Gordon Lyon 的访谈[INTERVIEW WITH GORDON LYON](https://www.usenix.org/publications/login/winter2016/interview-gordon-lyon)中，我们也得以一窥其开发历程。

Gordon Lyon（常用nickname为fyodor）自1997年起便开始编写并维护 Nmap。同时，他还维护了多个著名的网络安全网站，如：https://nmap.org、https://SecLists.org、https://SecTools.org、https://insecure.org 以及 https://SecWiki.org。

此外，他还是 Computer Professionals for Social Responsibility (CPSR) 的前任主席，并与他人合著了《Nmap Network Scanning》、《Know Your Enemy: Honeynets, and Stealing the Network》等书籍。

如果对 fyodor 的更多个人经历感兴趣，可查阅[Gordon Lyon的领英个人主页](https://www.linkedin.com/in/gordon-lyon)。

### co-authors

罗马的辉煌并非一蹴而就，工具的诞生也非一人之功。除了 fyodor 的卓越贡献外，Tom Sellers、david David Fifield 和 dmiller Dan Miller 等人也纷纷参与其中，成为高频出现的身影。

这些贡献者大都是各自领域的专家，如密码学领域的 [Brandon Enright](https://www.brandonenright.net/)、Lua 领域的 [Patrick Donnelly](https://github.com/batrick)。他们凭借独特的想法，开发了各种辅助工具，如 ncrack 作者 [ithilgore](https://github.com/ithilgore)。

很多人都是 fyodor 的朋友，有的甚至是因为 fyodor 的引导才踏入网络安全领域的。例如，nping 的主要作者 Luis MartinGarcia，就是在 2009 年的 Google Summer of Code program 中，在 Gordon Lyon 的带领下，开始了自己的 nmap 研发之旅。

### 开源社区

除了那些活跃的 committer，开源社区也是 nmap 开发的主力军。从提交记录中我们可以看出，有很多知名大公司、著名软件的开发者参与了维护工作。如微软的 Jeffrey Robertson（a-jeffro(a)microsoft.com），Apache 的 Ben Laurie（ben(a)algroup.co.uk）等。

除了功能的维护、指纹的添加外，开源社区的一个重要贡献是提供了多语言的支持，这些贡献多数来自于世界各地的不同国家。主要是各种 man page 和 GUI 的文字翻译。这些大部分都是由对应母语的开源工作者参与的，这为 nmap 的全球化发展提供了有力的支持。

### 开源协作

要探讨开源项目，自然离不开它的协作方式。Nmap 的代码通过 SVN 进行管理，可以在现在已经公开的 [svn 仓库](svn.nmap.org) 中找到它的第一次提交：``fyodor | 1996-03-18 11:20:10 +0800 (周一, 18 3月 1996)``。

最初，Nmap通过电子邮件接收patch的方式来接受开源社区提交的补丁。自1999年以来，一些主要的修改可以在 changelog 中找到。从2005年开始，Nmap对应维护了一个非公开的Git仓库，并会定期从SVN中同步。2007年，他们开放了公共的SVN。

2015年，他们开始使用 GitHub ，与普通的 Github 项目不同，Nmap 并不使用 GitHub 的所有能力， GitHub 主要是作为 nmap 的 bug tracker 使用。后来也接受 PR ，但使用 GitHub 的方式是基于 GitHub 的 CICD 检查 PR 后，关闭 PR ，将对应的patch应用到主分支中。这也是在 nmap 的仓库中，只会看到关闭的 PR ，而没有被合并的 PR 的原因。

到4.0版本，大版本会发布一些更新概述，早期的更新发布在insecure.org上，如 https://insecure.org/stf/Nmap-4.00-Release.html、https://insecure.org/stf/Nmap-4.50-Release.html ，后期发布在nmap.org上，如 https://nmap.org/5/、https://nmap.org/6/、https://nmap.org/7/。

## 主要能力

具体而言，nmap 的强大功能涵盖了主机探测、端口扫描、指纹识别以及脚本扫描等多个方面。实际上，在 nmap 的第一个版本中，就已经集成了大部分常用的扫描技术。例如，现在技术文章中经常提到的 TCP SYN扫描、FIN扫描、全连接扫描等。在 nmap 开源十年后，我们可以从[changelog](https://nmap.org/changelog.html)中看到，大部分更新都是关于bug修复和指纹库的更新，而少有扫描技术的更新。

既然主要功能已经圆满完成，那么维护的工作量是否相对较小呢？开源项目的维护实际上并非易事。Nmap 诞生于早期操作系统百花齐放的年代，包括 OpenBSD、Solaris、Unix、BSDI 等多种操作系统，这些系统存在一些各不兼容的 ABI。而在操作系统发展到Linux、Windows、MacOS三分天下的阶段，Nmap 又遇到了 Windows 操作系统的大版本更新。对于 Nmap 这种涉及各种操作系统底层机制的工具，要完成长期的维护意味着要不断适配这些 ABI ，并不是一件轻松的工作。

操作系统中各种复杂的机制，以及标准库的不断变化，也都是让人头疼的问题。在跨越二十多年的时间长廊中，许多看似稳定的 ABI 也难以保证其长久的可靠性。更糟糕的是，众多依赖库和编程语言的频繁更新，给维护工作带来了无尽的困扰。以 nmap 的重要 GUI 工具 Zenmap 为例，它最早诞生于2007年，那还是 Python 的早期阶段。然而，Python的更新换代如同疾风骤雨，给更新带来了不少困难，直到2023年，Zenmap 才终于迈入了 Python3 的时代。

然而，正是因为一群开源贡献者们的孜孜不倦地努力，我们才得以享受到如今功能丰富且稳定的 nmap 。在同一个时代，并非没有工具能够实现 nmap 的扫描能力。Fyodor曾提到了许多出色的扫描器，如strobe by Julian Assange、netcat by Hobbit、stcp by Uriel Maimon、pscan by Pluvius、ident-scan by Dave Goldsmith以及SATAN tcp/udp scanners by Wietse Venema等等。然而，如今这些工具中的大部分已经难觅踪影，其中长期维护的困难无疑是一个重要的原因。

## fun facts

在翻阅这nmap文档和代码的过程中，也发现了许多有趣的细节。

### 静默安装

熟悉Windows渗透的同学，或许了解这样一个 trick：通常情况下， nmap 是无法在不引起用户注意的情况下悄悄安装的，它需要用户亲自点击才能完成安装。然而，一个特殊的版本——[OEM版本](https://nmap.org/oem/) 却可以实现这一目标。这个特殊版本实际上是为了满足商业用户的需求而开发的，它可以在不被察觉的情况下完成安装。

### 吐槽vc++

与众多开发者一样，nmap在开发过程中也遭遇了vc++的困境，甚至在文档中忍不住吐槽了一长段：

```
Renamed rpc.h and error.h because they conflict with Windows include files.  By the way, this was a pain to figure out because VC++ is such a crappy compiler!  It basically just says problem in "foobar.h" without giving you any idea how foobar.h got included! gcc gives you a nice message tracing the chain of include files!
```

### 论如何防止骚扰邮件

由于开源项目很多联络都是通过邮件，不少开发者们在 changlog 中留下了邮箱。这也使得垃圾邮件找上门来，看得出来开发者们是不厌其烦。在后续的发布中，邮箱格式都是非标准的邮箱格式。

到了某一次提交，开发者们故意扔了很多gov邮件地址，如 ``ce@ftc.gov, rhundt@fcc.gov, jquello@fcc.gov, sness@fcc.gov, president@whitehouse.gov, haesslich@loyalty.org``。

### waf 引发的血案

nmap，作为一个扫描的软件，自然是被一些系统管理员厌恶的，于是通过一些方案来防御nmap也是可以想见的。然而，有些方法反而导致了更多的问题。例如 fyodor 就提到了一个[例子](https://nmap.org/book/nmap-defenses-trickery.html)。他的一个朋友安装了蜜罐来误导脚本小子的扫描，然而蜜罐的漏洞却使得机器被安装了后面。

### Uncertainty Tricks

需要注意的是 nmap 的许多高级技巧和选项并不是天然正确的，有些是需要一些限制或条件的影响。以[-sM](https://nmap.org/book/scan-methods-maimon-scan.html) 参数为例，这里应用了的是很多 BSD 系统对于RFC 793不正确的实现，他们在处理特殊报文时简单地丢弃数据包而不是根据 RFC 的规定生成一个 RST 数据包作为响应。这就导致该参数在大部分情况下的结果反而是错误的。

## 相关链接

- INTERVIEW WITH GORDON LYON: https://www.usenix.org/publications/login/winter2016/interview-gordon-lyon
- Gordon Lyon的领英个人主页: https://www.linkedin.com/in/gordon-lyon
- Brandon Enright: https://www.brandonenright.net/
- Patrick Donnelly: https://github.com/batrick
- ithilgore: https://github.com/ithilgore
- svn 仓库: svn.nmap.org
- changelog: https://nmap.org/changelog.html
- OEM版本: https://nmap.org/oem/
