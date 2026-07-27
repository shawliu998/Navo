# Navo 3–5 分钟产品演示

## 演示目标

只讲一件事：Navo 如何把一个模糊业务目标，变成有证据、有判断、有人工决定、也有明确负责人的操作闭环。

演示前：

```bash
NAVO_RESEED=1 pnpm bootstrap
pnpm dev:mock
```

打开 `http://localhost:3100`，进入 Demo Workspace。

## 0:00–0:30｜一句话定义

“Navo 是一个工业 B2B 账户研究与外联协作工作台。它帮助团队判断哪些账户值得跟进、依据是什么、应该准备什么内容，以及回复之后由谁完成下一步。”

强调三个词：**证据、边界、责任人**。

## 0:30–1:15｜Account Intelligence

页面：

```text
/app/accounts/00000000-0000-4000-8000-000000000100
```

讲解顺序：

1. Rheinwerk 是当前黄金账户；
2. Fit score 不是模型拍脑袋，而是确定性 qualification；
3. Verified intelligence 分成 Sales signal 和 Verified fact；
4. 每条证据有来源和置信度；
5. 右侧 Next Best Action 已经承接到回复后的会议任务。

不要进入 Contacts、Signals 全站目录或设置页。

## 1:15–2:05｜Mission Workbench

页面：

```text
/app/missions/00000000-0000-4000-8000-000000001900
```

说明：

- 自然语言目标被保存为结构化 Mission；
- 执行有账户、迭代、续接和外部动作边界；
- Summary 展示当前进度与 human checkpoint；
- Plan 页可以回放每一步，不把“Agent 思考”藏在聊天记录里；
- 模型负责结构化判断；线性调度、状态变化和硬规则由代码负责。

## 2:05–2:55｜Human Checkpoint

已完成、只读的黄金链路审批：

```text
/app/approvals/00000000-0000-4000-8000-000000001400
```

重点：

- 左侧同时展示证据、系统建议和完整 proposed message；
- 消息引用 Rheinwerk 的 inline inspection 与 manufacturing footprint；
- 右侧显示 reviewer、时间和 decision outcome；
- 已审批状态只读，不能重复审批。

如果要现场演示编辑/批准，改用待审批记录：

```text
/app/approvals/00000000-0000-4000-8000-000000001401
```

## 2:55–3:45｜Reply → Next Best Action

页面：

```text
/app/conversations/00000000-0000-4000-8000-000000001050
```

讲解：

- outbound DRAFT 的来源与最终正文可见；
- EmailSink 收到 “Can we meet next Tuesday?”；
- 系统分类为 POSITIVE；
- Conversation Summary 保留 commitment；
- Next Best Action 是 Schedule discovery meeting；
- 同一个 action 被承接为一个 owner-assigned task；
- thread 只读，系统没有偷偷增加真实发送能力。

## 3:45–4:30｜模型合同与评测

展示终端命令，不现场等待：

```bash
pnpm smoke:deepseek
```

说明：

- 当前 adapter 使用 `deepseek-v4-flash`；
- structured operation 显式 non-thinking，保持 JSON contract；
- plannerMode 必须是 AI，fallback 必须为 null；
- 第一次真实测试发现实体漂移，随后增加 fixture identity rendering、authoritative-field override 和回归测试；
- 最终 V4 结果的 ID、账户名、证据信号保持一致。

## 4:30–5:00｜收束

“这个作品的重点不是页面数量，而是我先定义了完整操作链，再把模型、确定性代码和人工决定放到各自合适的位置。系统中的事实可以追溯，动作有边界，失败可以复现，结果能够通过测试验证。”

## 不要演示

- Agents、Tools、Settings；
- Play builder 的全部节点；
- EmailSink 开发工具页；
- 审计、provider、token、cost 控制台；
- 任何未验证的真实发送或生产级安全承诺。
