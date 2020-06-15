---
title: Python 进程、线程与协程
date: 2020-06-15 19:48:12
categories: Programing
tags:
    - Python
---

# 0x00 序

在程序开发的过程中，会遇到协程、线程与进程之间的选择问题，对这些概念有清晰了解才能写出效率更高的代码。

<!--more-->

# 0x01 进程

对操作系统来说，进程是系统进行资源分配和调度的基本单位，每个进程都有自己的独立内存空间，不同进程通过进程间通信来通信。进程内至少有一个线程，它们共享进程的地址空间，而进程有自己独立的地址空间。

在多核的场景下，如果想要充分地使用多核CPU的资源，需要使用多进程的形式。Python提供了multiprocessing作为多进程的原生实现，提供了Process、Queue、Pipe、Lock等组件来支持子进程、通信和共享数据、执行不同形式的同步。

# 0x02 线程

线程是操作系统能够进行运算调度的最小单位，它被包含在进程之中，是进程中的实际执行单位。

CPython的线程是操作系统的原生线程。在Linux上为pthread，在Windows上为Win thread，完全由操作系统调度线程的执行。一个Python解释器进程内有一个主线程，以及多个用户程序的执行线程。

## 2.1 GIL

需要注意的是，即使在多核心CPU平台，由于GIL的存在，也将禁止多线程的并行执行。

GIL（Global Interpreter Lock）是全局解释器锁，存在于Python解释器中，用来确保当前只有一个线程被执行。GIL的存在保证了只有正在执行的线程才可以与解释器的内核进行通信，避免了混乱。

当一个线程遇到I/O任务时，将释放GIL。I/O 密集型的多线程程序 GIL 并不是瓶颈，但是计算密集型的多线程程序 GIL 会带来较大的性能损失。

## 2.2 最佳线程数

在开发过程中，需要考虑CPU的核心数和利用率问题，常用的一个公式是 ``最佳线程数目 = ( ( 线程等待时间 + 线程CPU时间 ) / 线程CPU时间 ) * CPU数目`` 。

# 0x03 协程

协程（Coroutine），又称微线程、纤程，它自带CPU的上下文，是比线程更小的执行单元。

协程有极高的执行效率，因为协程间切换是由程序自身控制的，没有线程切换的开销，和多线程比，线程数量越多，协程的性能优势就越明显。

Python可以基于greenlet、gevent库实现协程，也可以基于原生的yield生成器、asyncio异步协程来实现。

其中yield生成器的实现如下：

```python
def task1():
    # 需要有 While True 来保证一直执行
    while True:
        print("task 1 before yield")
        yield
        print("task 1 after yield")

def task2():
    while True:
        print("task 2 before yield")
        yield
        print("task 2 after yield")
        
def main():
    # 生成器对象
    t1 = task1()
    t2 = task2()
    print("init")
    next(t1)
    print("switch from t1 to t2")
    next(t2)
    print("switch from t2 to t1")
    next(t1)

if __name__ == "__main__":
    main()
```

# 0x04 补充材料

## 4.1 Amdahl 定律

阿姆达尔定律（Amdahl's law，Amdahl's argument）是计算机科学界的经验法则，因 Gene Amdahl 而得名。它代表了处理器并行运算之后效率提升的能力。

阿姆达尔定律是计算总量不变时时的量化标准，可以使用公式 ``((Ws + Wp) / (Ws + Wp / p))`` 来表示。

# 0x05 参考链接

- [Python3 文档 协程与任务](https://docs.python.org/zh-cn/3/library/asyncio-task.html)
- [Does PyPy have a GIL? Why?](http://doc.pypy.org/en/latest/faq.html#does-pypy-have-a-gil-why)
- [Amdahl's law](https://en.wikipedia.org/wiki/Amdahl%27s_law)
