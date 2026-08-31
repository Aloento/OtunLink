# OtunLink 实施计划

> 本项目按「每轮一个 checkpoint、串行实现」推进。详见 [docs/checkpoints/README.md](docs/checkpoints/README.md) 与各 `ck-XX-*.md`。

## 工作流规则（强制）

1. **每个 checkpoint 由独立子 agent（全新上下文）实现**，主对话只做：启动子 agent、审查 diff、跑最小验证、验收、提交/推送。禁止在主对话中直接实现 checkpoint 代码。
2. **提交信息禁止附加 `Co-authored-by: Copilot` 等 vibe coding 相关内容**（仓库规则，见 docs/checkpoints/README.md 第 30 行）。
3. 一个 checkpoint 一个 commit，消息如 `feat(items): 物品目录与扫码 (ck-04)`。
4. 子 agent 每轮只读 `docs/checkpoints/README.md` + 自己的 `ck-XX-*.md` + `design.md` 相关章节；按「每轮统一要求」完成验证并更新状态。
5. **子 agent 必须显式指定模型 `deepseek/deepseek-v4-flash-vision-exp`**（默认模型不可用会导致 agent 静默无响应；用 task 工具的 `model` 参数）。

## 进度

| 阶段 | Checkpoint | 状态 |
| ---- | ---------- | ---- |
| P0-P9a | ck-00 ~ ck-09a | ✅ 全部完成（ck-09a 提交 2dfcfe8，已推送 origin/main） |
| P9b | ck-09b 零售售后退货闭环 | ⏳ 下一步 |
| P10 | ck-10 通知/审计/邮件桥/上线 | 待启动 |

## 下一步（ck-09b）

- 依据 [docs/checkpoints/ck-09b-aftersale.md](docs/checkpoints/ck-09b-aftersale.md) 与 design.md §5.6 实现：
  - 售后单（零售发起退货/退款 → 仓库处理 → 回仓/拒退）
  - RETURN_IN 流水回补库存；与销售单联动（可部分退货）
- 由子 agent 实现（模型 `deepseek/deepseek-v4-flash-vision-exp`），完成后主对话审查验收并提交。
