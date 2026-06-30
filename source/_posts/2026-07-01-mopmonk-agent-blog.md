---
title: MopMonk Agent：漏洞复现里的任务记忆
date: 2026-07-01 00:00:00
categories: AI
tags:
    - Coding Agent
    - CyberGym
    - Vulnerability
---

MopMonk Agent 是一个面向自动化漏洞复现的 agent 系统。它使用 MiniMax M3 作为 base model，核心设计是 memory-centric multi-agent，在 CyberGym Level 1、4 小时 timeout 的设置下得到 73.1% 的成功率。

这里需要先区分两个层面：MiniMax M3 提供长上下文和代码推理能力，MopMonk 在外层加入了围绕漏洞复现任务设计的记忆、并行探索和执行验证循环。这篇文章主要看后面这一层。

<!--more-->

## 先说它要做什么

CyberGym Level 1 给 agent 的信息并不多：漏洞描述和修复前的代码库。没有 crash trace，没有 patch diff，也没有修复后的代码作为提示。最后提交的是一个 raw input file。

这个输入文件要满足两个条件：

- 在 vulnerable 版本触发目标漏洞。
- 在 fixed 版本不再触发这个漏洞。

这条差分验证很重要。它把"撞出一个 crash"和"复现漏洞"分开了。真实漏洞复现也差不多：读描述，读代码，找入口，构造输入，看运行反馈，然后继续改。

所以 CyberGym Level 1 测的是一个闭环：漏洞线索理解、代码理解、输入构造、执行反馈吸收、验证收敛。

它也有边界。这个任务更接近 OSS-Fuzz 风格的软件漏洞复现，主要覆盖 parser、内存安全、sanitizer crash 这类问题。完整的 0-day 挖掘能力、Web、云、权限链路等安全问题，需要用别的口径来评估。

## MopMonk 的重点是任务状态

MopMonk README 里花了不少篇幅讲结构化漏洞记忆。我的理解是，除上下文长度外，它还关注哪些状态需要留下来。

长上下文有用，但窗口大不代表任务状态会自己稳定。漏洞复现跑到几十轮以后，真正有价值的信息经常来自失败：

- 某个入口其实不可达。
- 某种输入格式能过 parser，但到不了目标分支。
- 某个长度字段不匹配会提前退出。
- 某个候选 PoC 只触发了格式错误，没有触发目标漏洞。
- 某次运行超时、build 失败或 crash 类型不对。

这些信息如果只躺在日志里，很容易沉底。下一轮 agent 重新打开一堆文件，又可能踩同一个坑。

MopMonk 的做法是把这些状态写进任务记忆。README 列出的 memory 类型很具体：

| Memory 类型 | 记录内容 |
| --- | --- |
| Vulnerability-goal memory | 漏洞目标、成功条件、任务约束 |
| Code-path memory | 入口点、harness、解析链、可疑函数、关键数据流 |
| Input-format memory | 文件格式、字段关系、长度约束、边界条件、有效和无效输入模式 |
| Candidate-PoC memory | 候选输入、生成理由、触发行为、变异方向、待验证假设 |
| Negative-evidence memory | 不触发尝试、不可达路径、build failure、格式错误 |
| Verification-state memory | 候选 PoC 是否触发，以及失败原因 |
| Next-constraint memory | 下一轮必须满足的分支、字段、约束或规避条件 |

这套分类把漏洞复现拆成了几个相对稳定的对象：目标、路径、格式、候选 PoC、失败证据、验证状态和下一步约束。

这里有两项比较关键：negative-evidence memory 和 next-constraint memory。前者保存"为什么没触发"，后者把失败转成下一轮必须避开的条件。失败因此不只留在日志里，也会进入后续搜索边界。

## 它的循环大概长什么样

按 README 的描述，MopMonk 的工作流可以理解成这样：

```text
漏洞描述 + 代码库
  -> 初始化漏洞目标和候选代码路径
  -> 生成或变异一个候选 PoC
  -> 执行验证
  -> 记录 crash / no crash / timeout / 格式错误 / 不可达路径
  -> 提炼下一轮必须满足的约束
  -> 再生成下一个更接近目标路径的 PoC
```

普通 agent loop 很容易写成：

```text
读代码 -> 想办法 -> 生成输入 -> 运行 -> 失败 -> 再想办法
```

MopMonk 的循环更接近这样：

```text
读代码 -> 建立漏洞记忆
生成输入 -> 运行验证
失败原因 -> 写入负证据
有效线索 -> 写入路径和格式约束
下一轮 -> 只探索更可能满足约束的方向
```

这一步看起来像是整理日志，但搜索质量会变。漏洞复现更像受约束的搜索，需要让每一次尝试都比上一次少犯一点已经犯过的错。

## 多 agent 的价值在共享证据

MopMonk 也把自己描述为 multi-agent。放到这个任务里，除了 agent 数量，还需要看探索结果如何共享。

同一个漏洞描述可以有几条探索路线：从 sanitizer 类型推输入边界，从 parser 入口构造最小样例，从文件格式约束倒推字段关系，或者从可疑函数追可达路径。多个 exploration attempts 可以并行试这些方向。

如果探索结果互不共享，并行很容易变成重复试错。一个 agent 已经证明某条路径不可达，另一个 agent 还可能再花时间验证一遍。

MopMonk 的思路是让每次探索都读当前 vulnerability memory，并把结果写回去。这样并行探索共享同一个证据池，可以减少重复探索。

这也解释了漏洞挖掘 agent 和普通聊天 agent 的差异。只增加对话数量，不能保证每条探索线继承其他探索线留下的证据。

## MiniMax M3 是底座

MopMonk README 明确写到，本次提交使用 MiniMax M3 作为 base model。选择理由包括长上下文能力、MoE 架构、稀疏注意力、代码能力，以及长程 agentic 和 cowork 场景里的稳定性。

这些理由和 CyberGym 任务是对得上的。漏洞复现需要读代码库，吸收工具反馈，跨多轮保持目标一致，还要能从执行结果里修正假设。上下文长度和长程执行稳定性都会影响这类任务。

但 73.1% 不能直接归因给模型本身。CyberGym leaderboard 里的高分系统通常都包含外层工程系统，模型只是其中一部分。

比如 MDASH 强调 prepare / scan / validate / dedupe / prove 的多阶段系统；Crystalline 强调 Claude Code 加 MCP memory，并公开了 recall / remember / consolidate 等记忆机制。MopMonk 的公开说明则集中在 vulnerability-oriented memory 和 shared-memory exploration。

所以可以把它拆成两层看：MiniMax M3 提供长上下文和代码推理能力，MopMonk 的记忆和验证循环负责把试错结果留下来，再把下一轮推向更可能触发 PoC 的方向。

## 73.1% 放在榜单里怎么读

按照 README 和整理资料里的 CyberGym Level 1 数据，MopMonk Agent 的 73.1% 大概在这个位置：

| Agent | Model | Success Rate |
| --- | --- | ---: |
| Crystalline | Claude Opus 4.6 | 89.6% |
| MDASH | Multi-model | 88.45% |
| OpenAI Agent | GPT-5.5-Cyber | 85.6% |
| Anthropic Agent | Claude Mythos Preview | 83.1% |
| OpenAI Agent | GPT-5.5 | 81.8% |
| OpenAI Agent | GPT-5.4 | 79.0% |
| MopMonk Agent | MiniMax M3 | 73.1% |
| Claude Code | GLM-5.1 | 68.7% |
| Anthropic Agent | Claude Opus 4.6 | 66.6% |
| Codex CLI | GPT-5.4 | 66.3% |

这个表只用于给 MopMonk 找参照位置：MopMonk 位于 Crystalline、MDASH、GPT-5.5-Cyber 之后，也位于若干通用 agent 和通用模型组合之前。

MopMonk 给出的解释主要落在任务记忆上。README 反复讲的是任务内证据如何沉淀成可更新的漏洞记忆。如果这个说法和实际实现一致，73.1% 更像一个工程结果：在真实代码库漏洞复现任务里，长上下文模型配合任务记忆，可以让 agent 少绕一些已经绕过的路。

## 可以借鉴什么

如果从这个仓库里抽一个可复用的点，我会先看它对漏洞复现任务的抽象方式。分数和"多 agent"这个标签都可以先放到后面。

MopMonk 的核心在于保存漏洞复现过程中的状态：

- 目标漏洞是什么。
- 哪些入口和路径已经确认。
- 输入格式里有哪些约束。
- 哪些 PoC 候选试过，结果如何。
- 哪些方向已经证明走不通。
- 下一轮必须满足什么条件。

这个抽象对很多安全任务都有参考价值。自动化漏洞挖掘、灰盒 fuzz、代码审计、PoC 生成，本质上都不是一次性问答。它们都有大量中间状态，而且失败状态经常比成功状态更有价值。

以前我们容易把这些东西放在日志里。日志可以查，但 agent 下一轮未必会主动使用。MopMonk 的思路是把这些状态提升成任务记忆，让 agent 在下一轮显式继承。

这种方式更偏工程化，也更容易和执行反馈结合。

## 最后

公开信息能支撑的判断并不多，但有一条很明确：MopMonk 没有只把模型直接接到仓库上。它在维护任务状态，尤其是失败状态。

CyberGym Level 1 的 73.1% 说明这套做法已经跑出了一部分结果。后续如果能公开更多实现细节，外部才能看清这套 memory-centric design 怎么落地，以及它在更广泛的安全任务上还能不能保持效果。

通用 coding agent 常问的是"能不能读懂代码并修改代码"。MopMonk 这类系统的问题范围更明确：agent 能不能把一次次失败也变成资产，最后推到一个真的会崩、也经得起 fixed 版本验证的输入文件上。

## 参考资料

- MopMonkAgent README：https://github.com/MopMonkAI/MopMonkAgent/README.md
- CyberGym 官方页面：https://www.cybergym.io/cybergym/
- CyberGym 论文：https://arxiv.org/abs/2506.02548
- CyberGym GitHub 仓库：https://github.com/sunblaze-ucb/cybergym
- CyberGym leaderboard 数据源：https://www.cybergym.io/assets/data/cybergym.json
- MiniMax M3 官方介绍：https://www.minimax.io/blog/minimax-m3
- MiniMax M3 Hugging Face 模型卡：https://huggingface.co/MiniMaxAI/MiniMax-M3
- Microsoft MDASH 介绍：https://www.microsoft.com/en-us/security/blog/2026/05/12/defense-at-ai-speed-microsofts-new-multi-model-agentic-security-system-tops-leading-industry-benchmark/
- Crystalline technical report：https://raw.githubusercontent.com/synchopate/cybergym-logos/main/technical-report.md
