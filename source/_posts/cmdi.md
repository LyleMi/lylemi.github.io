---
title: 命令注入成因小谈
date: 2019-10-19 09:23:51
categories: Web
tags:
    - Command Injection
---

最近做测试的时候，发现不同平台/语言下命令注入的结果会有一定的不同，于是尝试对命令注入的成因做了一个更细致的探索。

<!--more-->

## 语言实现

### PHP

PHP命令执行的函数很多，其中大部分函数的实现都在 ``php-src/ext/standard/exec.c`` 中:

- system
- exec
- passthru
- proc_open
- shell_exec

其中 system / exec / passthru 的实现调用链都是 ``php_exec_ex -> php_exec -> VCWD_POPEN`` 。

proc_open 的实现在 ``php-src/ext/standard/proc_open.c`` 中，调用 ``execle / execl`` 执行 ``/bin/sh -c`` 。

popen的实现在 ``php-src/ext/standard/file.c`` 中，和 shell_exec 一样直接调用 ``VCWD_POPEN`` 。

pcntl_exec 的实现在 ``php-src/ext/pcntl/pcntl.c`` 中，调用 ``execve`` 执行 ``/bin/sh -c``。

而 ``VCWD_POPEN`` 定义在 ``Zend\zend_virtual_cwd.h`` 中，根据编译配置有两种实现：

```c
#define VCWD_POPEN(command, type) virtual_popen(command, type)
// or
#define VCWD_POPEN(command, type) popen(command, type)
```

其中 virtual_popen 在 ``Zend/zend_virtual_cwd.c`` 中

```c
CWD_API FILE *virtual_popen(const char *command, const char *type) /* {{{ */
{
    return popen_ex(command, type, CWDG(cwd).cwd, NULL);
}
```

所以PHP中的命令执行大都只是对popen做了不同程度和形式的封装。

可以用下面这个小demo来做简单验证：

```php
<?php

system('id');
echo exec('id');
passthru('id');
echo shell_exec('id');

$descriptorspec = array(
   0 => array("pipe", "r"),
   1 => array("pipe", "w"),
   2 => array("pipe", "w")
);

$process = proc_open('id', $descriptorspec, $pipes);

if (is_resource($process)) {
    echo stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $return = proc_close($process);
}

$handle = popen('/usr/bin/id 2>&1', 'r');
$read = fread($handle, 4096);
echo $read;
pclose($handle);

pcntl_exec('/usr/bin/id');
```

执行 ``strace -f -e trace=execve php 1.php`` 可以看到6次 ``execve("/bin/sh", ["sh", "-c"...`` 的调用。

### Java

Java执行系统命令使用 ``Runtime.getRuntime().exec`` 。JDK实现 ``Runtime.getRuntime().exec`` 实际调用了 ``ProcessBuilder`` ，而后 ``ProcessBuilder`` 调用 ``ProcessImpl`` 使用系统调用 ``vfork`` ，把所有参数直接传递至 ``execve`` 。

但是和PHP不同的是，Java并没有调用 ``popen`` ，也没有给 ``execve`` 传入 ``sh -c`` ，而是直接把参数传递至 ``execve`` 。

一个简单的demo如下

```java
import java.io.*;

public class Main {
    public static void main(String[] args) {
        String [] cmd={"/usr/bin/id", "&&", "/usr/bin/id"};
        try {
            Process proc = Runtime.getRuntime().exec(cmd);
            InputStream fis = proc.getInputStream();
            InputStreamReader isr = new InputStreamReader(fis);
            BufferedReader br = new BufferedReader(isr);
            String line = null;
            while((line=br.readLine()) != null)    
            {    
                System.out.println(line);    
            }    
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}

```

用 ``strace -f -e vfork,execve java Main`` 跟踪可以看到上面的Java代码在Linux中调用为

```c
execve("/usr/bin/id", ["/usr/bin/id", "&&", "/usr/bin/id"], [/* 22 vars */]
```

### Python

跟踪程序的具体实现需要相对多的精力和时间，有一个相对简单的方式是直接使用 ``strace`` 跟踪，例如Python常用的调用是 ``os.system`` 和 ``subprocess.check_output`` 。

```python
import os
import subprocess

os.system('id')
subprocess.check_output('id')
```

那么执行 ``strace -f -e vfork,execve python t.py`` ，可以发现 ``system`` 对应 ``execve("/bin/sh", ["sh", "-c", "id"]`` ，而 ``subprocess.check_output`` 对应 ``execve("/usr/bin/id"`` 。

## 系统调用

简单对语言实现层面做了一个了解后，不难看出，大部分语言在Linux平台下，系统调用会调用 ``popen`` ，而Windows平台下则是 ``CreateProcess`` ，而 ``popen`` 和 ``CreateProcess`` 的实现则是造成不同场景下命令注入有轻微不同的原因。

### popen

popen是libc中的函数，当前版本的glibc中，popen的实现在 ``libio/iopopen.c`` 中的 ``_IO_new_popen`` 函数。这个函数的调用链是： ``_IO_new_popen -> _IO_new_proc_open -> spawn_process -> __posix_spawn`` 最后调用了 ``sh -c`` 。 ``sh -c`` 会将之后传入的字符串当作命令执行，所以在没有做过滤的情况下，PHP的系统调用，Python的 ``os.system`` 都会出现问题。

这里有一个细节是，sh会指向 ``/bin/sh`` ，在当前版本的Linux中，`/bin/sh` 默认指向 ``/bin/dash`` 。 `dash` 编译文件的大小大概在150k左右，而我们常用的 `bash` 大小在 1000k 左右，很直觉的，`bash` 的功能会更丰富一些。

例如 dash 中没有 function 关键字支持，不支持 here string，不支持 数组，dash 不支持 ++ 操作符等，这会在一些利用了bash特性的复杂payload中造成一些不同。

还有一点需要注意的是虽然 Windows 中也提供了 ``_popen`` 作为POSIX的兼容，但是在Windows平台中， ``_popen`` 最后调用的是 ``CreateProcess`` ，因而与 Linux 平台下的表现有一定的出入。

### CreateProcess

上面提到在Windows中，调用链的底层会最后创建进程使用的是 ``CreateProcess`` ，在普通情况下，这个函数即使不转义也不会出现问题，但是根据Windows文档，当 ``CreateProcess`` 中的第一个参数为 bat 文件或是 cmd 文件时，会调用 ``cmd.exe`` 。所以当调用的参数第一个是bat文件时，会变成类似 ``cmd.exe /c "test.bat & id"`` 的调用，这样就会和 ``sh -c`` 一样引入了命令注入的潜在可能。

例如 ``String [] cmd={"whoami", "&", "whoami"}; `` 并不会正确执行，这里相当于把 ``&`` 作为了 whoami 的参数传递了。而 ``String [] cmd={"sth.bat", "&", "whoami", "&", "whoami"}; `` 则会执行两次 ``whoami`` 。

还有一个需要注意的特性是，和Linux不同，Windows在处理参数方面有一个特性，如果这里只加上简单的转义还是可能被绕过。例如 ``<?php system('dir "\"&whoami"');`` 在Linux中会报错，而在Windows会执行 ``dir`` 和 ``whoami`` 两条命令。

这是因为Windows在处理命令行参数时，会将 ``"`` 中的内容拷贝为下一个参数，直到命令行结束或者遇到下一个 ``"`` ，但是对 ``\"`` 的处理有误。因此在调用批处理或者cmd文件时，需要做合适的参数检查才能避免漏洞出现。

## 参考链接

+ git://git.kernel.org/pub/scm/utils/dash/dash.git
+ http://git.savannah.gnu.org/cgit/bash.git/
+ https://hg.openjdk.java.net/jdk/jdk
+ https://docs.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw
+ https://docs.microsoft.com/en-us/cpp/c-runtime-library/reference/popen-wpopen?view=vs-2019
+ https://blogs.msdn.microsoft.com/twistylittlepassagesallalike/2011/04/23/everyone-quotes-command-line-arguments-the-wrong-way/
