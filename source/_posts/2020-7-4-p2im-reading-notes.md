---
title: Usenix 2020 P²IM 论文阅读笔记
date: 2020-07-04 10:52:36
tags: 论文阅读
---

## 摘要

对固件设备的测试通常受限于硬件支持，难以规模化，这在一定程度上导致了IoT漏洞的泛滥。因此文章提出了一种名为P²IM的方法，可以执行自动化的仿真测试。文章中对70个样例固件和10个真实设备的固件进行了测试，真实固件包括无人机、机器人、PLC等。在没有人工辅助的情况下，可以执行79%的固件。经过测试，文章找到了7个不同的bug。

<!--more-->

## 论文信息

- 论文标题: P²IM: Scalable and Hardware-independent Firmware Testing via Automatic Peripheral Interface Modeling
- 论文作者: Bo Feng, Alejandro Mera, Long Lu
- 作者单位: Northeastern University
- 发表期刊：Usenix
- 发表时间：2020

## 研究背景

文章主要目标是对微控制器（Microcontrollers, MCU）进行测试，微控制器是在特定场景下功耗更优的机器。MCU的固件通常包含：设备驱动、微型操作系统、系统库、一些特殊的逻辑/应用等。

## 研究挑战

对微控制器固件进行测试要解决的问题主要有硬件依赖、外设、多样化的系统设计，不完整的测试接口等。

硬件依赖主要是大部分之前的测试工作都依靠硬件完成，但是目前的硬件仿真并不完备，会在相当程度上影响测试效率。使用实体设备的话，在规模化时又会遇到问题。

此外，每一个固件都会和大量的外设有交互。这些外设是MCU厂商自定制的，有不同的接口和交互方式。因此通常需要不同的模拟器，需要大量的定制工作。

和平常使用的操作系统不同，MCU设备会使用更多的自定制系统/系统库，有相当多样化的系统设计。这在模糊测试中也是需要考虑的。

普通的程序是基于标准I/O或文件，但是固件大部分是从外设中直接读取的，测试接口并不完整，Fuzzer需要满足和设备的交互功能。

## 解决方案

文章的主要贡献是提出了P²IM(Processor-Peripheral Interface Modeling)，即对外设进行自动化的建模来解决问题。MCU设备的外设有片上(on-chip)外设的，也有芯片外(off-chip)的外设，因为芯片无法直接控制 off-chip 这里文章仅考虑芯片上外设的建模。

这里主要使用抽象模型定义(Abstract Model Definition)和自动模块实例化(Automatic Model Instantiation)来完成模块。抽象模型定义基于专家经验定义模型，把寄存器分为控制寄存器、状态寄存器、数据寄存器、控制-状态寄存器。

自动模块实例化则基于之前的模型定义，基于执行对模型进行填充。主要是查找寄存器的类型、寄存器在内存中的位置、中断等。具体工作流如下图所示：

![工作流](/images/2020-7-4/1.png)

文章基于P²IE(Processor-Peripheral Interface Equivalence)来标定仿真的正确性，主要的三个指标为仿真器仿真了对应的外设接口、仿真器的行为和固件期望的行为一致、固件运行中没有crash/hang或者跳过一些操作。

## 实验测试

文章测试环境为 `Intel® Core™ i5-7260U CPU @ 2.20GHz` `8 GB RAM` ` Ubuntu 16.04` 。

#### 单元测试

文章选择了3个常用的MCU系统库(NuttX, RIOT, and Arduino)和3个MCU SoCs (STM32 F103RB, NXP MK64FN1M0VLL12, and Atmel SAM3X8E)来进行单元测试的实验。这些MCN SoC来自于不同的主要厂商，也被集成进入了不同的设备中。

基于上述的选择，文章找到了70个不同的样例固件用于测试。在这些测试例中，寄存器类型的正确判断率为 76% 到 92%。基于P²IE进行判断，测试的准确率达到了79%。

具体测试数据如下图：

![测试数据](/images/2020-7-4/4.png)

#### 真实设备测试

文章选取了十个真实设备进行测试，包括自平衡机器人、PLC、网关、无人机等，这些设备更加复杂，多样性更多。在真实设备的测试中，文章取得了更好的结果，只有 8.2% 的寄存器误分类率。除了在 Soldering Iron 的两例误分类导致的运行终止外，框架均正确的运行。在最后，文章总共发现了7个不同的bug。

准确率数据如下图：

![准确率数据](/images/2020-7-4/2.png)

误分类数据如下图：

![误分类数据](/images/2020-7-4/3.png)

## 待完善项

文章的未完善的部分主要是没有实现Direct Memory Access、只支持ARM架构。P²IM只实现了对寄存器和中断的，没有实现DMA的情况。这里主要是因为DMA依赖固件的设计，不同的固件间不同。加上文章在测试时只有不到十分之一的固件使用DMA，所以文章不对DMA进行实现。

在非ARM架构的MCU上，文章测试了三种不同架构的MCU，包括ATmega328P (AVR)、PIC32MX440F256H (MIPS)、FE310-G000 (RISC-V)。基于对架构的分析，作者认为这种方式是可以在不同架构间通用的。不过在一些特殊的架构(AVR)上，还需要一定的定制化支持。

## 参考链接

- [P²IM: Scalable and Hardware-independent Firmware Testing via Automatic Peripheral Interface Modeling](https://www.usenix.org/conference/usenixsecurity20/presentation/feng)
