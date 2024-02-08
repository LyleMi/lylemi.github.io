---
title: 端扫算法优化：随机化篇
date: 2024-02-08 13:14:01
tags: 测绘
---

在进行端口扫描时，引入随机化技术可以增加隐蔽性，降低被目标系统检测到的风险，从而提高扫描的成功率。本文将讨论常用端扫工具在目的端口和IP的随机化算法。

<!--more-->

## 基础

在进行端口扫描随机化时，我们可以将IP地址和端口号组合视为一个数组。为了实现随机化，我们可以对这个数组进行打散处理。以 python 为例，默认的 random.shuffle 的实现通常基于 Fisher-Yates（或称为 Knuth）洗牌算法。基本步骤如下：

- 从序列的最后一个元素开始，向前遍历到第一个元素。
- 对于当前位置 i，从 0 到 i（包括 i）之间选择一个随机索引 j。
- 交换位置 i 和位置 j 上的元素。
- 重复步骤 2 和 3，直到到达序列的开始。
- 以下是 Fisher-Yates 洗牌算法的一个简单实现示例：

```python
import random

def shuffle(lst):
    for i in range(len(lst) - 1, 0, -1):
        j = random.randint(0, i)
        lst[i], lst[j] = lst[j], lst[i]
    return lst
```

尽管该算法的空间复杂度和时间复杂度均为O(n)，相对较低，但在面对IPv4地址空间的十亿级规模时，这一方案就显得不太可行了。

即使不扫描整个IPv4地址空间，一个内网B段包含256*256=65536个IP地址，每个IP地址有65536个端口，总共有2^32个元素。在最小的情况下，一个IP地址加端口需要6字节，那么所需的存储空间将达到6(2^32) / 2^10 / 2^10 / 2^10 = 24GB。

具体的运行时间可以用以下代码估计

```python
import os
import random
import timeit

def measure_shuffle_time(list_size):
    random_list = [os.urandom(6) for _ in range(list_size)]
    shuffle_time = timeit.timeit(lambda: random.shuffle(random_list), number=1)
    return shuffle_time

sizes = [2**10, 2**16, 2**24]
for size in sizes:
    elapsed = measure_shuffle_time(size)
    print(f"Size: {size}, Time: {elapsed} seconds")
```

输出

```
Size: 1024, Time: 0.00024179997853934765 seconds
Size: 65536, Time: 0.017682800069451332 seconds
Size: 16777216, Time: 7.696443499997258 seconds
```

2的8次方乘以6等于1536秒，即25分钟。一个B段的随机化过程需要大量时间。那么，已有的算法是如何解决这个问题的呢？

## nmap

nmap 中，随机化通过 ``-r`` 选项开启，在代码中处理逻辑如下：

```c
if (o.randomize_ports) {
  if (ports.tcp_count) {
    shortfry(ports.tcp_ports, ports.tcp_count);
    // move a few more common ports closer to the beginning to speed scan
    random_port_cheat(ports.tcp_ports, ports.tcp_count);
  }
  if (ports.udp_count)
    shortfry(ports.udp_ports, ports.udp_count);
  if (ports.sctp_count)
    shortfry(ports.sctp_ports, ports.sctp_count);
  if (ports.prot_count)
    shortfry(ports.prots, ports.prot_count);
}
```

而随机化算法如下，是简单的洗牌算法

```c
void shortfry(unsigned short *arr, int num_elem) {
  int num;
  unsigned short tmp;
  int i;

  if (num_elem < 2)
    return;

  for (i = num_elem - 1; i > 0 ; i--) {
    num = get_random_ushort() % (i + 1);
    if (i == num)
      continue;
    tmp = arr[i];
    arr[i] = arr[num];
    arr[num] = tmp;
  }

  return;
}
```

最后会对常用端口做一个优化

```c
// Move some popular TCP ports to the beginning of the portlist, because
// that can speed up certain scans.  You should have already done any port
// randomization, this should prevent the ports from always coming out in the
// same order.
void random_port_cheat(u16 *ports, int portcount) {
  int allportidx = 0;
  int popportidx = 0;
  int earlyreplidx = 0;
  /* Updated 2008-12-19 from nmap-services-all.
     Top 25 open TCP ports plus 113, 554, and 256 */
  u16 pop_ports[] = {
    80, 23, 443, 21, 22, 25, 3389, 110, 445, 139,
    143, 53, 135, 3306, 8080, 1723, 111, 995, 993, 5900,
    1025, 587, 8888, 199, 1720,
    113, 554, 256
  };
  int num_pop_ports = sizeof(pop_ports) / sizeof(u16);

  for(allportidx = 0; allportidx < portcount; allportidx++) {
    // see if the currentport is a popular port
    for(popportidx = 0; popportidx < num_pop_ports; popportidx++) {
      if (ports[allportidx] == pop_ports[popportidx]) {
        // This one is popular!  Swap it near to the beginning.
        if (allportidx != earlyreplidx) {
          ports[allportidx] = ports[earlyreplidx];
          ports[earlyreplidx] = pop_ports[popportidx];
        }
        earlyreplidx++;
        break;
      }
    }
  }
}
```

通过分析代码，我们可以清楚地看到nmap并未对IP地址进行随机化处理。此外，我们还可以利用strace工具，在不需要检查代码的情况下，验证这一结论。

```bash
strace -e sendmsg nmap 10.5.0.0/24 -p 2233,4455
```

显而易见，nmap的随机方法采用了较为简化的策略，通过牺牲随机性来对端口进行随机化处理。

## masscan

转而关注 masscan，从其源代码中我们发现，masscan 的随机化算法源自论文 [Ciphers with Arbitrary Finite Domains](http://www.cs.ucdavis.edu/~rogaway/papers/subset.pdf)。该算法通过类似块密码的方法实现了一种变换。即类似

```
0 -> 6
1 -> 4
2 -> 8
3 -> 1
4 -> 9
5 -> 3
6 -> 0
7 -> 5
8 -> 2
9 -> 7
```

显然，我们可以按照此算法对0到n进行依次变换，并获取相应的IP端口对。此方法还可用于恢复进度。此外，masscan也提供了该算法的基准测试方案，可以通过以下命令执行：

```bash
masscan --benchmark --blackrock-rounds 10
```

输出如下：

```
=== benchmarking (64-bits) ===

-- blackrock-1 --
rounds = 10
iterations/second = 9.829-million

-- blackrock-2 --
rounds = 10
iterations/second = 11.433-million

-- smack-1 --
bits/second = 3569.068-million
clocks/byte = 0.000
clockrate = 0.000-GHz
```

从 [benchmarking 的源代码](https://github.com/robertdavidgraham/masscan/blob/master/src/crypto-blackrock.c) 可以看出，预先配置的数组范围和迭代次数都较高，这表明该算法的整体时间成本相对较低。此外，该算法也不需要额外的空间资源。

```c
blackrock_benchmark(unsigned rounds)
{
    struct BlackRock br;
    uint64_t range = 0x012356789123ULL;
    uint64_t i;
    uint64_t result = 0;
    uint64_t start, stop;
    static const uint64_t ITERATIONS = 5000000ULL;
    ...
```

## zmap

与nmap和masscan不同，zmap在设计时旨在覆盖整个互联网空间。基于这一目标，zmap在设计过程中采用了循环群技术对IPv4地址空间进行随机化处理。

循环群是一种独特的群结构，其特性在于可通过单一元素生成，即群内所有元素均可表示为此元素的幂。此元素被称为循环群的生成元或原根。具体来说，假设G是一个群，a是G中的某个元素，若存在正整数n，使得a的n次幂能够遍历G中的所有元素，且a的幂次模n不会重复，则称G是由a生成的循环群，且a是G的一个生成元或原根。例如，整数集合Z构成一个循环群，由1生成，因为任何整数都可以表示为1的幂次。另一个例子是模p的剩余系构成的乘法群，由原根生成，因为原根的幂可以取遍所有非零剩余类。循环群在数学和密码学领域都有着广泛的应用。在密码学中，循环群可用来构建公钥密码系统，例如Diffie-Hellman密钥交换算法和ElGamal加密算法。

具体来说，Zmap使用[循环群算法](https://github.com/zmap/zmap/blob/main/src/cyclic.c#L196)找到一个大于2的32次方的原根，通过每次遍历这个循环群来实现其遍历IPv4地址空间的能力。

```c

static cyclic_group_t groups[] = {
    {// 2^8 + 1
     .prime = 257,
     .known_primroot = 3,
     .prime_factors = {2},
     .num_prime_factors = 1},
     ...
    {// 2^32 + 15
     .prime = 4294967311,
     .known_primroot = 3,
     .prime_factors = {2, 3, 5, 131, 364289},
     .num_prime_factors = 5},
     ...
};

static uint32_t find_primroot(const cyclic_group_t *group, aesrand_t *aes)
{
  uint32_t candidate =
      (uint32_t)((aesrand_getword(aes) & 0xFFFFFFFF) % group->prime);
  uint64_t retv = 0;

  const uint64_t max_root = (UINT64_C(1) << 22);

  do {
    candidate += 1;
    candidate %= group->prime;
    candidate %= max_root;

    mpz_t prime;
    mpz_init_set_ui(prime, group->prime);
    int ok = 1;
    for (size_t i = 0; i < group->num_prime_factors && ok; ++i) {
      const uint64_t q = group->prime_factors[i];
      const uint64_t k = (group->prime - 1) / q;
      mpz_t base, power, res;
      mpz_init_set_ui(base, candidate);
      mpz_init_set_ui(power, k);
      mpz_init(res);
      mpz_powm(res, base, power, prime);
      uint64_t res_ui = mpz_get_ui(res);
      if (res_ui == 1) {
        ok = 0;
      }
      mpz_clear(base);
      mpz_clear(power);
      mpz_clear(res);
    }
    if (ok) {
      retv = candidate;
      break;
    }
  } while (1);
  log_debug("zmap", "Isomorphism: %llu", retv);
  return retv;
}
```

## 参考链接

https://github.com/robertdavidgraham/masscan/blob/master/src/crypto-blackrock.c
https://github.com/zmap/zmap/blob/main/src/cyclic.c#L196
http://www.cs.ucdavis.edu/~rogaway/papers/subset.pdf

