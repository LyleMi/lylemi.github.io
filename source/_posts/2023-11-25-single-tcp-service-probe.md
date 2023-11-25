---
title: 服务识别方案探索：单TCP流识别
date: 2023-11-25 15:29:24
tags: 测绘
---

在攻击面管理/渗透测试中，服务识别无疑是一项至关重要的任务。然而，现有的服务识别方法通常依赖于多报文探测，这种方式在大量扫描时会严重影响效率甚至触发防火墙导致识别失败。因此，本文提出了一种基于单次TCP连接进行服务识别的方案，隐蔽性强、探测效率高。

<!--more-->

## 已有方案

以nmap为例，其主要通过指纹识别进行服务识别，即使用不同的TCP探针多次建立TCP连接识别目标服务。主要算法如下图所示：

在其当前版本的[指纹文件](https://github.com/nmap/nmap/blob/master/nmap-service-probes)中，包含了143个探针。这意味着在极端情况下，我们需要发送143个报文才能识别目标服务。显然，这种方式的代价是相当大的。

![nmap 探测算法](/images/2023-11/nmap.png)

## 方案优化

那么，我们是否能找到一种方式，只需要单个TCP流就能识别绝大部分协议呢？

### 合并空探针

在网络扫描工具nmap中，第一个探针被命名为null probe，即不发送任何报文，而是等待服务端先发送报文。这种探针主要用于探测SSH等服务。

容易想到，这种探针可以被其它探针合并。具体来说，我们可以在建立连接之后，等待一段时间，如果服务端没有发送报文，则切换到下一个主动探针，发送探测报文。这种方法可以减少一次TCP握手，从而提高效率。

![合并空探针探测算法](/images/2023-11/merge-empty.png)

对于常用协议，如HTTP等，我们可以通过合并空探针和HTTP探针，将两次探测变为一次探测，从而显著减少报文数量和握手次数。

### 错误响应识别

合并空探针的方案可以解决减少常见协议识别的探针数量，然而，对于非HTTP协议，我们仍然需要做多次的指纹遍历。幸运的是，尽管部分协议和HTTP协议不兼容，但是它们会解析HTTP请求并返回错误响应。

例如，对于一个常见的HTTP探针，mongodb会返回一个特定的错误信息，我们可以通过这个错误信息来识别mongodb服务。

```
HTTP/1.0 200 OK
Connection: close
Content-Type: text/plain
Content-Length: 85

It looks like you are trying to access MongoDB over HTTP on the native driver port.
```

同样，部分不会解析HTTP请求的服务，也会返回特定的错误信息。例如 redis 在收到HTTP请求后，会返回：

```
^-ERR wrong number of arguments for 'get' command\r\n$
```

因此，我们可以通过错误响应来识别服务，再次省略掉很大一部分探针。此外，我们还可以在HTTP探针后附加一些特定的字符，来复用这个探针，实现更好的效果。

### 异常响应识别

遗憾的是，对于一个常见的HTTP探针，还有许多常见的数据库并不返回任何响应。例如postgres和mssql，由于HTTP报文并不符合它们的格式，它们会直接关闭连接。

那么，我们是否就无法用HTTP的探针来区分postgres和mssql这两种协议呢？其实并非如此。实际上，这两种协议的响应有微妙的区别，即它们断开连接时的字节数不同。

以postgres为例，如下图所示。消息的第一个字节标识消息类型，随后四个字节标识消息内容的长度（该长度包括这四个字节本身）。也就是说，正常的postgres实现都是先读取5个字节，如果我们发送五个字节的HTTP报文，对面服务是postgres时，将断开连接。

![postgres报文](/images/2023-11/postgres.png)

同样，对于mssql，其TDS协议有8字节的TDS包头，后续接收数据。当发送9个字节的探针时，mssql会断开连接。注意这里和postgres的情况有所不同，这主要与服务端的实现有关，但是对于同一种服务器，触发断开连接的报文数量是一致的。

![mssql报文](/images/2023-11/mssql.png)

当然，这种方式并不完美，部分协议断连的字节数可能是一致的，还有一些协议并不会主动断开连接。

对于断连字节相同的情况，本文的方式可以实现初步分类，起到减少其它探针的效果。例如，如果服务端只读取了5个字节的报文就断开连接，那么对端只需要探测postgres等少数协议。

算法如下图所示

![基于异常响应识别的算法](/images/2023-11/rst-based-algo.png)

## 实现Sample

在实现该算法时，我们需要注意的是，单纯的逐次调用send会无法达到预期的效果，因为send系统调用并不立刻发送，而是等待操作系统缓冲区，所以在具体扫描时需要设置特定的标志位。在发送单个字节后也需要一定时间等待对端的RST到达。

下面是基于异常探测的一份简单验证代码的实现：

```python
content = b"""GET / HTTP/1.0\r\nUser-Agent: curl/7.68.0\r\nAccept: */*\r\n\r\n"""
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1)

sock.connect(addr, int(port))
for idx in range(len(content)):
    try:
        sock.send(chr(content[i]).encode())
    except ConnectionResetError as e:
        print("stop at ", idx)
        break
    # 等待缓冲区
    time.sleep(0.01)
```

## 优缺点

需要注意的是，基于异常的方案是存在适用范围的，如果目标服务存在非标准实现，例如读取字节的行为不一致，方案只能退化为遍历探针的方式。不过，反过来看，这种方式也能识别一些基于配置的弱交互蜜罐。

此外，虽然这种方式只进行了一次TCP连接，但由于探测异常只能碎片化的发送报文，额外的TCP包头也会占用一些流量，所以这种方法在扫描速度的提升上相对有限。

## 总结

总的来说，本文发现了一种新的基于单次TCP连接进行服务识别的方案，为端口服务探测供了一种新的思路和可能性，可以在很大程度上减少探测报文的发送。
