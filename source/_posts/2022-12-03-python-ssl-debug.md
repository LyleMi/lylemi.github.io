---
title: 一次Python TLS适配出错的调试过程
date: 2022-12-03 08:12:03
tags: python
---

事情起源于支持低版本TLS Web站点的扫描预期，开始觉得是比较简单的配置问题。而后随着调试发现涉及到Python的历史遗留问题等多个坑点，于是做了记录以供保存。

<!--more-->

## 问题一

最开始考虑直接使用 requests 的 HTTPAdapter 配置 ssl_context 的 minimum_version 直接解决问题，缩减后的样例代码如下：

```python
import ssl
import requests

class HTTPAdapter(requests.adapters.HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ssl_context = ssl.create_default_context()
        ssl_context.minimum_version = ssl.TLSVersion.TLSv1
        kwargs["ssl_context"] = ssl_context
        return super().init_poolmanager(*args, **kwargs)

with requests.Session() as s:
    s.mount("https://", HTTPAdapter())
    s.get("https://tls-v1-0.badssl.com:1010/")
```

比较意外的是报错了： ``urllib.error.URLError: <urlopen error [SSL: UNSUPPORTED_PROTOCOL] unsupported protocol (_ssl.c:1131)>`` 。

考虑这种情况有两种可能：是 ssl 的问题，或者设置 ssl_context 没有生效。

于是直接通过ssl测试：

```python
import ssl
import socket
def get_ssl_data(host, port=443):
    context = ssl.create_default_context()
    sock = socket.socket(socket.AF_INET)
    conn = context.wrap_socket(sock, server_hostname=host)
    conn.connect((host, port))
    print(conn.getpeercert())

get_ssl_data("tls-v1-0.badssl.com", 1010)
```

仍然报错，这样看来是底层SSL库的原因。

确认了下当前环境： ``Ubuntu 20.04 / Python 3.8.10 / OpenSSL 1.1.1f`` 没有旧版本，应该不是环境的问题。考虑到有可能是较新的版本程序/操作系统在逐步废弃较低的TLS版本。

抓包查看了 TLS 通信过程，发现报错信息是版本不支持，那应该是有其它的安全配置没有打开，于是通过搜索找到了一个方案 ``context.set_ciphers('ALL:@SECLEVEL=1')`` ：

```python
import ssl
import socket
def get_ssl_data(host, port=443):
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1
    sock = socket.socket(socket.AF_INET)
    context.set_ciphers('ALL:@SECLEVEL=1')
    conn = context.wrap_socket(sock, server_hostname=host)
    conn.connect((host, port))
    print(conn.getpeercert())

get_ssl_data("tls-v1-0.badssl.com", 1010)
```

可以成功获取。

那么回过来考虑是否minimum_version设置不对。

在这篇Python的官方[文档](https://docs.python.org/zh-cn/3/library/ssl.html)中提到：

    3.6 版后已移除: OpenSSL 已经废弃了所有特定于版本的协议。请换用带有 SSLContext.minimum_version 和 SSLContext.maximum_version 的默认协议 PROTOCOL_TLS_SERVER 或 PROTOCOL_TLS_CLIENT 。

也就是说 minimum_version 是新版本的正确写法。

继续寻找原因，发现是 Ubuntu 在修复 [bug](https://bugs.launchpad.net/ubuntu/+source/gnutls28/+bug/1856428) 时patch了OpenSSL的行为，需要通过设置配置的方式显示打开才行。而上文使用的 ``set_ciphers('ALL:@SECLEVEL=1')`` 相当于显示设置了SECLEVEL。

所以只要通过 set_ciphers 设置安全等级即可，这里的配置也可以是 ``set_ciphers('DEFAULT:@SECLEVEL=1')`` 。

## 问题二

项目的另一个需求是需要获取到对端站点的证书信息。由于 requests 的 HTTPResponse 对象不带证书、连接等信息， 原本获取证书的方法是通过层层 hook 加入证书信息。代码如下：

```python
import requests

HTTPResponse = requests.packages.urllib3.response.HTTPResponse
orig_HTTPResponse__init__ = HTTPResponse.__init__
def new_HTTPResponse__init__(self, *args, **kwargs):
    orig_HTTPResponse__init__(self, *args, **kwargs)
    try:
        self.peer_certificate = self.peer_certificate
    except AttributeError:
        pass
HTTPResponse.__init__ = new_HTTPResponse__init__

HTTPAdapter = requests.adapters.HTTPAdapter
orig_HTTPAdapter_build_response = HTTPAdapter.build_response
def new_HTTPAdapter_build_response(self, request, resp):
    response = orig_HTTPAdapter_build_response(self, request, resp)
    try:
        response.peer_certificate = resp.peer_certificate
    except AttributeError:
        pass
    return response
HTTPAdapter.build_response = new_HTTPAdapter_build_response

HTTPSConnection = requests.packages.urllib3.connection.HTTPSConnection
orig_HTTPSConnection_connect = HTTPSConnection.connect
def new_HTTPSConnection_connect(self):
    orig_HTTPSConnection_connect(self)
    try:
        self.peer_certificate = self.sock.connection.get_peer_certificate()
    except AttributeError:
        pass
HTTPSConnection.connect = new_HTTPSConnection_connect
```

但是发现加入上文的 ssl_content 后无法获取到证书了，报错提示没有 ``get_peer_certificate``  方法。

调试发现，默认情况下，requests 发起 https 请求进行 tls 通信使用的实例是 ``<class 'urllib3.contrib.pyopenssl.WrappedSocket'>`` 。

这个类是 urllib3 基于 pyOpenSSL 的封装，``get_peer_certificate``  这个方法也是 pyOpenSSL 提供的。

而在显式设置 ssl_context 后，使用的 tls对象则是 ``<class 'ssl.SSLSocket'>`` ，在ssl中并不存在 ``get_peer_certificate``  这个方法。

这是由于 PyOpenSSL 库是在 Python 早期尚不支持 ssl 的时候加入的社区开源库，目的是提供对 OpenSSL 的 Python 封装。而原生的 ssl 库主要目的是支持 tls 通信，并不提供完整的 OpenSSL 封装。两个库之间互相不保证一致性，因此这里就无法获取对象了。

而这里可以使用原生库的 ``_connection.sock.getpeercert(True)`` 方法来获取证书。

### 问题三

由于 ``urllib3.contrib.pyopenssl.WrappedSocket`` 是早期 urllib3 为了支持 tls 引入的，目前已经在计划弃用，所以在实现中放弃了原有的证书获取方案，转而使用原生的 ssl 。

但是在测试过程中，同样也在考虑如果要使用 PyOpenSSL 的 Context 是否可行，测试代码如下：

```python
import ssl
import socket
from urllib3.contrib.pyopenssl import PyOpenSSLContext
context = PyOpenSSLContext(ssl.PROTOCOL_SSLv23)
context.set_ciphers('ALL:@SECLEVEL=1')
sock = socket.socket(socket.AF_INET)
conn = context.wrap_socket(sock)
```

测试后发现并不能正常发起请求，报错显示 ``UNSUPPORTED_PROTOCOL`` 。


在命令行测试设置 cipher 可以正常连接。

```bash
openssl s_client -connect tls-v1-0.badssl.com:1010 -cipher 'ALL:@SECLEVEL=1'
```

考虑是否不同库的 set_ciphers 的行为不同。追踪了下调用，PyOpenSSL 的 set_ciphers 实际调用在 ``SSL.py``  的 ``set_cipher_list`` 函数，通过 ``_lib.SSL_CTX_set_cipher_list(self._context, cipher_list)`` 调用 openssl 库。这里的 ``_lib`` 是通过 ``cryptography.hazmat.bindings`` 中的 ``_openssl.pyd`` 文件引入的。python 原生的 ssl 库则将 context 相关的调用都封装在 ``_ssl.pyd`` 中，同样是二进制调用 ``SSL_CTX_set_cipher_list`` 。

于是考虑是否原生 ssl 库和 PyOpenSSL 调用的版本不同。通过 ``strace -e openat python`` 跟踪调用库。

在测试环境下，原生库的ssl调用了 ``/usr/lib/python3.8/lib-dynload/_ssl.cpython-38-x86_64-linux-gnu.so`` ，该 so 之后调用 ``/lib/x86_64-linux-gnu/libssl.so.1.1`` 。而 PyOpenSSL 则直接调用了 ``/lib/x86_64-linux-gnu/libssl.so.1.1`` ，两者 SSL 版本一致。

> 注意，在Windows环境下，Python 在安装时会安装对应的 libssl 到 Python\DLLs 目录，而 PyOpenSSL 则使用 cryptography.hazmat.bindings.openssl.binding 对应的 OpenSSL 库，此时原生 ssl 和 PyOpenSSL 两者版本是不一致的。

既然版本是一致的，那么考虑是否调用存在问题。通过 gdb 调试，在 ``SSL_CTX_set_cipher_list`` 处下断点发现 ssl 库多了一次初始化的 ``SSL_CTX_set_cipher_list`` 调用，参数为 ``"DEFAULT:!aNULL:!eNULL:!MD5:!3DES:!DES:!RC4:!IDEA:!SEED:!aDSS:!SRP:!PSK"`` 。相关逻辑在这个 [代码](https://github.com/python/cpython/blob/main/Modules/_ssl.c) 中。此外，原生 ssl 库还有多处其它的初始化行为。

然而对应设置进行测试后，发现不是设置选项的原因。

继续查看代码发现 PyOpenSSLContext 初始化 通过 ``_openssl_versions`` (定义如下)

```python
_openssl_versions = {
    ssl.PROTOCOL_SSLv23: OpenSSL.SSL.SSLv23_METHOD,
    ssl.PROTOCOL_TLSv1: OpenSSL.SSL.TLSv1_METHOD,
}
```

传递给 OpenSSL.SSL.Context ，根据这个变量获取SSL上下文。
```python
method_func = self._methods[method]
method_obj = method_func()
context = _lib.SSL_CTX_new(method_obj)
```

而根据 openssl [手册](https://www.openssl.org/docs/man3.0/man3/TLSv1_method.html) : 

    These functions do not exist anymore, they have been renamed to TLS_method(), TLS_server_method() and TLS_client_method() respectively. 

所以这里创建了一个错误的上下文，后面的设置也就没有意义了。

最后修改代码如下，可以成功连接：

```python
import ssl
import socket
from urllib3.contrib.pyopenssl import PyOpenSSLContext
context = PyOpenSSLContext(ssl.PROTOCOL_TLSv1)
context.set_ciphers("DEFAULT:@SECLEVEL=1")
sock = socket.socket(socket.AF_INET)
sock.connect(("tls-v1-0.badssl.com", 1010))
conn = context.wrap_socket(sock)
```

# 参考链接

- [urllib.request SSL Connection Python 3](https://stackoverflow.com/questions/47516722/urllib-request-ssl-connection-python-3)
- [Using 'requests' to access a website that only supports TLSv1.0 causing "unsupported protocol" error](https://www.reddit.com/r/learnpython/comments/hw6ann/using_requests_to_access_a_website_that_only/)
- [ssl.SSLError: unsupported protocol](https://stackoverflow.com/questions/32330919/python-ssl-ssl-sslerror-ssl-unsupported-protocol-unsupported-protocol-ssl)
- [pyOpenSSL](https://www.pyopenssl.org/en/latest/)
- [Add deprecation warnings for urllib3.contrib.pyopenssl](https://github.com/urllib3/urllib3/issues/2691)
- [Deprecate the pyOpenSSL TLS implementation and [secure] extra](https://github.com/urllib3/urllib3/issues/2680)
- [How to get response SSL certificate from requests in python](https://stackoverflow.com/questions/16903528/how-to-get-response-ssl-certificate-from-requests-in-python)
- [_ssl.c](https://github.com/python/cpython/blob/main/Modules/_ssl.c)
- [SSL_CTX_set_cipher_list](https://www.openssl.org/docs/manmaster/man3/SSL_CTX_set_cipher_list.html)
- [openssl-ciphers](https://www.openssl.org/docs/manmaster/man1/openssl-ciphers.html)
- [openssl](https://github.com/openssl/openssl)
- [pyOpenSSL Github](https://github.com/pyca/pyopenssl)

