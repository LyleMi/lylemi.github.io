---
title: 浅谈IP-地理位置映射关系构建
date: 2023-02-12 09:53:59
tags:
---

通过 IP 定位似乎并不是一个困难的问题，大量的三方平台如 Geolite、IPIP 等都提供了完善、更新及时的 IP 地理位置数据。但是如果没有这些数据，能否以常见的公开信息为基础，构建IP-地理位置信息映射呢？

<!--more-->

## IP分配

### 分配机构

让我们首先厘清IP的分配机制，实际IP分配是中心化分级进行的。负责分配IP地址的最上级机构是 ICANN (The Internet Corporation for Assigned Names and Numbers) (之前是由IANA负责)。

ICANN 首先把IP地址分给区域互联网注册管理机构 (Regional Internet Registries，RIR)，然后由RIR负责该地区的登记注册服务，下一级的机构则是大型组织，例如互联网服务提供商 (Internet service provider, ISP) 、大型企业技术公司、大学或政府机构运营，最后用户通过这些组织获取到了接入互联网的IP。

### 自治系统

具体来说，RIR分配IP地址多是以自治系统为单位进行分配的，自治系统 (Autonomous System, AS) 是具有统一路由策略的巨型网络或网络群组，连接到互联网的每台设备都连接到一个具体的自治系统。

每个自治系统都分配有一个自治系统编号 (Autonomous System Number, ASN) ，ASN 是介于 1 和 65534 之间的唯一 16 位数字或介于 131072 和 4294967294 之间的 32 位数字。

RIR在分配AS时，并没有严格的标准，导致AS对应的注册单位信息会有差异性，有相对精确的例如：

- Luoyang, Henan Province, P.R.China.
- 26 Shyamoli, Bir Uttam A. W. Chowdhury Road
- Universiti Malaysia Terengganu

也会有分配大型ISP的情况，例如分配到 Chinanet 、AKAMAI-AS。

不难看出，在精确分配的前提下，可以粗略获取 IP 地理位置的信息。但是当IP分配到大型组织机构，例大型公司如微软、大型运营商如联通移动都拥有大量的机房与IP，这个时候很难通过这种方式获取到IP的具体信息。

具体的，可以通过 Whois 查看 IP 所属的AS单位。例如 ``whois 8.8.8.8`` 可以得到以下的结果 (完整输出较长，省略的部分用 ``...`` 标出) ：

```
whois 8.8.8.8

...

# start

NetRange:       8.0.0.0 - 8.127.255.255
CIDR:           8.0.0.0/9
NetName:        LVLT-ORG-8-8
NetHandle:      NET-8-0-0-0-1
Parent:         NET8 (NET-8-0-0-0-0)
NetType:        Direct Allocation
OriginAS:
Organization:   Level 3 Parent, LLC (LPL-141)
RegDate:        1992-12-01
Updated:        2018-04-23
Ref:            https://rdap.arin.net/registry/ip/8.0.0.0



OrgName:        Level 3 Parent, LLC
OrgId:          LPL-141
Address:        100 CenturyLink Drive
City:           Monroe
StateProv:      LA
PostalCode:     71203
Country:        US
RegDate:        2018-02-06
Updated:        2023-01-03
...
OrgAbuseHandle: ABUSE5250-ARIN
OrgAbuseName:   Abuse
OrgAbusePhone:  +1-650-253-0000
OrgAbuseEmail:  network-abuse@google.com
OrgAbuseRef:    https://rdap.arin.net/registry/entity/ABUSE5250-ARIN

OrgTechHandle: ZG39-ARIN
OrgTechName:   Google LLC
OrgTechPhone:  +1-650-253-0000
OrgTechEmail:  arin-contact@google.com
OrgTechRef:    https://rdap.arin.net/registry/entity/ZG39-ARIN

...
```

可以看出 8.8.8.8 是由 arin 分配给谷歌的IP。

### 小结

不难看出，从 ICANN 到 RIR 再到具体服务商的链路是很清晰的。但是其中公开信息只有 AS 的分配，也就是说可以知道哪一个 IP 段分配给了哪一个机构，而无法简单的从公开信息获取IP地址到具体地理位置的映射。

## 定位方法

### 地标定位

上文提到了一些 AS 会分配到相对精确的单位的，例如某个街道或者某个大学。容易想到，可以基于这种信息来对IP定位，然后基于这个基点向外扩充以获得更多IP的信息。这种方式被称为基于地标的定位。

在互联网发展早期，云服务普及程度不高，自建服务器的情况更频繁。这就使得除了特定AS以外，也可以通过一些知名单位的IP与位置来获得相邻IP的定位。而在服务上云以后，云的机房位置同样可以作为相对准确的地标信息来使用。此外，随着带有GPS组件的物联网设备、个人设备越来越普及，可以使用的地标信息也越来越多。

不过总体来说，由于地标分布较为离散，覆盖面和准确率都有限，这种方式只能一定程度上提供IP-地理位置映射的信息。

### 基于约束定位

基于地标信息定位的主要问题是地标分布过于离散，如果需要测试的IP离地标较远，则只能通过时延简单估测目标和地标之间的距离，可用性相对差，于是学界提出了新的方案，即基于约束定位 (Constraint-Based Geolocation, CBG) 。

基于约束定位的基本思想类似与多圆交汇定位法，首先获得目标IP与地标的时延，将时延乘以光纤的传输速度，即可以获得目标IP与地标的最远距离。那么和多个地标测出时延之后，每一组数据都以地标为圆心，最远距离为半径画圆，所有圆的公共交点即是目标的位置。

### 基于社交网络的定位

在公开的研究中，也有基于社交网络的定位方法。其中比较出名的是基于 twitter 公开数据的一系列研究。这种方式在获取用户的社交关系后建立社交网络，并通过部分推文暴露的地址构建用户的地理位置分布信息。这些研究则主要使用了神经网络等方法来训练模型，最后实现地理位置推断的能力。

类似的，当拥有其他可以将推文、社交网络、IP数据关联时，可以使用这种方案来建立IP-地理位置的映射关系。

## 网络度量

除了理论以外，在实际工程中，还有很多具体的问题需要解决。

### ping

直觉的，traceroute是一个合适度量两个IP间时延的方法。但实际上，很多营运商禁止了ICMP报文，在这种情况下，可以使用改造后的TCP/UDP等报文进行度量。

### 校准

上文提到了基于约束的定位方法，核心是将时延转化为距离的度量。但是实际这种方法受到网络之间拥塞程度、网络带宽、传输基建等多种因素影响，如果直接使用的话，精度会受到很大的限制。因此需要通过一些方案校准后才能正常使用。

## 杂谈

### 持续更新

最后，完成一次IP对应地理位置的测绘并不意味着一劳永逸。IP分配是一个变化的过程，不仅RIR会重新分配IP，例如将分配给运营商A的IP分配给运营商B；ISP也会重新分配自己所拥有的IP，例如客户A不再使用后，IP可能会分配给另一个客户，而两个客户的地理位置可能相差很远。因此如果要建立有时效性的数据库，需要及时对IP重分配的情况进行跟踪。

### 数据源

本文提到的都是合法合规的获取IP地理位置的方案，这也是大部分服务商使用的方案。部分服务商在技术上会有一定的创新和更新，但整体原理是相差不大的。

而除此之外，是存在一些别的方案的。一些大厂商，例如Google会利用浏览器的优势来构建IP地址位置数据库。如这篇 [帖子](https://news.ycombinator.com/item?id=34032484) 中提到，当用户通过Chrome上网且开放了GPS权限时，Chrome会通过调用GPS获取用户出口IP的地理位置并记录下来。

还有一些黑灰产可能会使用泄露的LBS数据等用于定位。

### 特例

最后，还有一些特殊情况需要考虑。例如当IP为大型组织用于CDN等用途时，常会使用anycast技术，此时单个ip实际对应多个位置。

# 参考链接

## 参考论文

- Gueye B, Ziviani A, Crovella M, et al. Constraint-based geolocation of internet hosts[C]//Proceedings of the 4th ACM SIGCOMM conference on Internet measurement. 2004: 288-293.
- Wang Y, Burgener D, Flores M, et al. Towards Street-Level Client-Independent IP Geolocation[C]//Nsdi. 2011, 11(2011): 27.
- Jurgens D, Finethy T, McCorriston J, et al. Geolocation prediction in twitter using social networks: A critical analysis and review of current practice[C]//Proceedings of the International AAAI Conference on Web and Social Media. 2015, 9(1): 188-197.

## 参考专利

- CN107181831B 一种逆向ip定位的方法
- CN111064817B 一种基于节点排序的城市级ip定位方法
- CN106254123B 一种面向城域网级别as域内网络拓扑的测绘方法

## rfc

- [RFC 1876 A Means for Expressing Location Information in the Domain Name System](https://www.rfc-editor.org/rfc/rfc1876)
