# Navo 作品评测报告

## 结论

Navo 适合作为 DeepSeek AGI 管培生申请作品，但应被介绍为“可控、可评测的业务 Agent 系统”，而不是“海外销售 SaaS”或“用了大模型的 CRM”。

Navo 通过把 Mission、结果验证、人工 checkpoint 和有限续接设为一等产品原语，体现了 Agent-native 的产品设计，而不是在传统工作台上附加聊天入口。

它最有说服力的部分不是页面数量，而是把模型放进了一个可验证的执行闭环：

```text
自然语言目标
→ 结构化计划
→ 有界工具执行
→ 证据与推断分离
→ 确定性资格评分
→ 人工审批
→ 回复理解
→ 下一步行动
→ 持久化结果与回放
```

## 个人贡献

这个作品的主要贡献不是页面或模型调用数量，而是完整的产品与系统规划：

- 从工业 B2B 销售问题中抽出一条可演示、可验证的核心操作链；
- 定义账户、证据、资格判断、Mission、审批、回复和下一步行动之间的关系；
- 划分模型判断、确定性代码和人工决定各自负责的部分；
- 设计执行次数、账户范围、续接、幂等和外部动作边界；
- 制定逐屏验收、自动化测试、真实模型 smoke test 和回归验证方法；
- 用真实仓库状态和测试结果校正实现，而不是让方案脱离现有接口。

编码助手被用作局部执行和复审工具；产品方向、任务拆解、取舍标准与最终验收由作者主导。更完整的说明见 [Navo 项目说明](PROJECT_STORY.zh-CN.md)。

## 要证明的能力

| 能力 | Navo 中的证据 | 通过标准 |
| --- | --- | --- |
| 问题抽象 | 目标被转换为 `MissionPlan` | 输出通过 Zod/JSON Schema，失败可修复或回退 |
| Agent 执行 | 计划步骤、工具注册表、BullMQ Worker | 只运行注册工具，不超过账户/迭代/续接上限 |
| Grounding | Evidence、Signal、Qualification、Draft | URL 可追溯，引用必须来自抓取内容 |
| 人机协作 | Approval Detail | 待审批可编辑；已决策只读；未审批不允许外部动作 |
| 可靠性 | PostgreSQL 状态、幂等键、不可变尝试历史 | 重试不覆盖历史，重复事件不创建重复任务 |
| 模型边界 | DeepSeek adapter + 后置校验 | 模型生成建议；持久化事实和业务规则保持权威 |
| 产品表达 | Account → Mission → Approval → Inbox | 招聘方可在 3–5 分钟理解完整闭环 |

## 评测矩阵

### 1. 静态与构建

```bash
pnpm lint
pnpm typecheck
pnpm build
```

结果：7 个 workspace package 全部通过；Next.js production build 成功。

### 2. 单元与集成

```bash
pnpm test
DATABASE_URL=postgresql://navo:navo@127.0.0.1:55432/navo \
REDIS_URL=redis://127.0.0.1:56379 \
pnpm --filter @navo/db test
```

覆盖重点：

- Mission planner 的 schema repair 与 fallback；
- 网站抓取的 SSRF、重定向、体积和超时边界；
- 引用必须是来源页面中的连续文本；
- 资格评分和 checkpoint 决策；
- 任务、记忆、回复闭环的幂等性；
- 队列失败后的可恢复状态；
- 取消、失败、重试和 Mission continuation；
- 模型叙述与持久化实体不一致时的强制归一化。

结果：数据库集成 13/13 通过；其余 package tests 全部通过。

### 3. 产品闭环 E2E

```bash
pnpm db:seed
pnpm e2e
```

Playwright 固定使用单 worker，避免多个测试同时修改同一个演示工作区。15/15 场景通过，覆盖：

- 登录、Overview、Accounts 和 Evidence；
- Mission 创建、AI 计划预览、执行与结果；
- Play 发布和 Test Run；
- 人工编辑与审批；
- Run attempt history；
- suppression 和 analytics；
- EmailSink 正向回复；
- classification、memory、next-best action、task 和 CRM mirror；
- CSV import 与去重。

### 4. 真实 DeepSeek V4

```bash
pnpm db:seed
pnpm smoke:deepseek
```

当前默认模型：`deepseek-v4-flash`。为保持现有结构化 JSON contract 的稳定语义，请求显式使用 non-thinking mode。

最终复测结果：

- `plannerMode: AI`
- `fallbackReason: null`
- `outcome: OPPORTUNITY_FOUND`
- 模型研究 2 个账户并选择 AlpenPack Maschinenbau GmbH
- `bestAccountId`、账户名称和三条证据信号一致
- 最终输出明确说明 outreach 仍是 DRAFT，未发送邮件

## 一次真实缺陷与修复

第一次 V4 smoke 中，模型返回了正确的 `bestAccountId`，但自由文本写成了 “Atlas Industrial Systems”。

根因不是简单的 UI 文案，而是本地 synthetic website fixture 对所有账户复用了 Atlas 页面内容，最终 summary 又过度信任模型叙述。

修复分两层：

1. fixture 在加载时渲染当前账户名称，保证测试来源和账户实体一致；
2. 最终 Mission result 用持久化的账户 ID、名称、ranking、qualification、signals、task 和 memory 覆盖模型返回的权威字段。

新增回归测试会故意让 provider 返回 Atlas 和错误账户 ID，并验证它们无法进入最终持久化结果。

这体现了本作品的核心判断：**schema-valid 不等于 grounded，结构化输出之后仍需要业务后置条件。**

## 明确边界

- synthetic 数据与 `.example` 网站只用于本地演示；
- EmailSink 是测试投递与回复模拟，不是真实邮件服务；
- CRM mirror 只读；
- 未实现 LinkedIn/联系人数据库搜索；
- 未实现生产级身份、权限、安全和可用性；
- 没有把 seed/mock 运行伪装成真实 DeepSeek 运行；
- DeepSeek smoke 是付费、非确定性检查，不属于日常 deterministic test suite。

## 面试时的推荐表述

“我不是想证明模型可以替人发销售邮件，而是想证明：当模型负责规划、研究和建议时，怎样通过结构化 contract、工具边界、证据引用、确定性规则、人工 checkpoint 和后置校验，把它变成一个可以评测和追责的 Agent 系统。真实 V4 测试确实发现了实体漂移，我把它转化成了 fixture 修复、authoritative-field override 和回归测试。”

## 参考

- [DeepSeek API 更新记录](https://api-docs.deepseek.com/zh-cn/updates)
- [DeepSeek 思考模式说明](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)
- [Navo architecture](../ARCHITECTURE.md)
