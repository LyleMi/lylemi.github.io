---
title: 基于QEMU和binfmt-misc透明运行不同架构程序
date: 2020-04-14 11:23:47
categories: Bin
tags: 
    - QEMU
    - 工具
---

# 0x0 序

基于qemu-user在x86架构上执行mips程序时，如果调用程序调用了 `execve` ，默认会使用x86的ld来载入程序，并抛出 `exec format error` 的错误信息。查询资料后发现Linux的binfmt-misc机制可以用户透明的实现调用不同架构程序的功能，于是进行了相关的尝试，于是将尝试的过程形成这篇文章，供之后查询。

<!--more-->

# 0x1 binfmt_misc

Linux内核有一个名为Miscellaneous Binary Format（binfmt_misc）的机制，可以通过要打开文件的特性来选择到底使用哪个程序来打开。这种机制可以通过文件的扩展名和文件开始位置的特殊的字节（Magic Byte）来判断应该如何打开文件。

可以通过以下命令来启用这种机制

```bash
mount binfmt_misc -t binfmt_misc /proc/sys/fs/binfmt_misc
```

这种方式会在系统重新启动之后失效，可以通过在 `/etc/fstab` 文件中加入下面这行来实现开机启动：

```
none  /proc/sys/fs/binfmt_misc binfmt_misc defaults 0 0
```

已加载的程序可以通过 `ls /proc/sys/fs/binfmt_misc/` 查看。

如果要加载新文件格式，可以通过向 `/proc/sys/fs/binfmt_misc/register`（该文件可写不可读）中写入一行匹配规则字符串来告诉内核以什么方式打开。

```
:name:type:offset:magic:mask:interpreter:flags
```

这个配置中每个字段都用冒号 `:` 分割，某些字段拥有默认值可以跳过，但是必须保留相应的冒号分割符。

各个字段的意义如下：

- name：规则名
- type：表示如何匹配被打开的文件，值为 `E` 或 `M` 。``E`` 表示根据扩展名识别，而 `M` 表示根据文件特定位置的Magic Bytes来识别
- offset：type字段设置成 `M` 之后有效，表示查找Magic Bytes的偏移，默认为0
- magic：表示要匹配的Magic Bytes，type字段为 `M` 时，表示文件的扩展名，扩展名是大小写敏感的，不需要包含 ``.``。type字段为 `E` 时，表示Magic Bytes，其中不可见字符可以通过 `\xff` 的方式来输出
- mask：type字段设置成 `M` 之后有效，长度与Magic Bytes的长度一致。如果某一位为1，表示与magic对应的位匹配，为0则忽略。默认为全部匹配
- interpreter：启动文件的程序，需要是绝对路径
- flags: 可选字段，控制interpreter打开文件的行为。共支持 `POCF` 四种flag。
    - `P` 表示 `preserve-argv[0]` 保留原始的 `argv[0]` 参数。
    - `O` 表示 `open-binary` ，binfmt-misc默认会传递文件的路径，而启用这个参数时，binfmt-misc会打开文件，传递文件描述符。
    - `C` 表示 `credentials` ，即会传递文件的 `setuid` 等权限，这个选项也隐含了 `O` 。
    - `F` 表示 `fix binary` ，binfmt-misc默认的行为在 spwan 进程时会延迟，这种方式可能会受到mount namespace和chroot的影响，设置 `F` 时会立刻打开二进制文件。

除此之外，还有一些额外的限制条件：

- 每一行规则字符串的长度不能超过1920个字符
- Magic Bytes必须在文件头128个字节内，即说offset+sizeof(magic)不超过128
- interpreter的长度不能超过127

每次成功写入一行规则，都会在 `/proc/sys/fs/binfmt_misc/` 目录下，创建一个名字为输入的匹配规则字符串中 `name` 字段的文件。通过读取这个文件的内容，可以知道这条匹配规则当前的状态：

```bash
cat /proc/sys/fs/binfmt_misc/<name>
```

而通过向这个文件中写入0或1，可以关闭或打开这条匹配规则，而写入-1表示彻底删除这条规则。

# 0x2 QEMU配置

apt包中有qemu相关的binfmt-misc配置，执行 `apt install qemu-user-binfmt` 即可安装。以 arm 为例，其配置如下：

```
$ cat /proc/sys/fs/binfmt_misc/qemu-arm
enabled
interpreter /usr/bin/qemu-arm
flags: OC
offset 0
magic 7f454c4601010100000000000000000002002800
mask ffffffffffffff00fffffffffffffffffeffffff
```

需要自定义部分配置时，以 `qemu-mips` 为例，根据上文描述的规则，一个配置如下：

```bash
echo ':qemu-mips:M:0:\x7f\x45\x4c\x46\x01\x02\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x08:\xff\xff\xff\xff\xff\xff\xff\x00\xfe\xff\xff\xff\xff\xff\xff\xff\xff\xfe\xff\xff:/qemu-mips:OC' > /proc/sys/fs/binfmt_misc/register
```

需要注意的一点是 `qemu-user-binfmt` 会默认安装所有 `qemu` 支持的格式，如果需要自定义规则，需要先 `echo -1` 注销掉之前的规则。

# 0x3 环境配置

仿真程序通常还涉及到不同架构的动态链接库，链接库的依赖有两种方式解决。一种方式是设置 `QEMU_LD_PREFIX` 环境变量，使得QEMU在加载程序时会在相应路径下寻找链接库。一种方式是通过 `chroot` ，创建一个新的 `root` 环境。其中要注意的是，chroot之后要注册相应的虚拟设备路径，同时 binfmt-misc 配置中的 qemu 路径也需要相应修改。

```bash
# 配置虚拟设备路径
mount -t proc proc     ./proc/
mount -t sysfs sys     ./sys/
mount -o bind /dev     ./dev/
mount -o bind /dev/pts ./dev/pts
```

# 0x4 参考链接

- [Kernel Support for miscellaneous Binary Formats](https://www.kernel.org/doc/html/latest/admin-guide/binfmt-misc.html)
- [binfmt_misc wikipedia](https://en.wikipedia.org/wiki/Binfmt_misc)
- [The real power of Linux executables](https://ownyourbits.com/2018/05/23/the-real-power-of-linux-executables/)
- [Transparently running binaries from any architecture in Linux with QEMU and binfmt_misc](https://ownyourbits.com/2018/06/13/transparently-running-binaries-from-any-architecture-in-linux-with-qemu-and-binfmt_misc/)
- [linux下使用binfmt_misc设定不同二进制的打开程序](https://blog.csdn.net/whatday/article/details/88299482)
