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
| P0-P10 | ck-00 ~ ck-10 | ✅ **全部完成**（ck-10 提交 3a22028，已推送 origin/main，共 200 用例全绿） |

## 状态

**P0→P10 共 12 个 checkpoint 全部实现并提交**，主流程贯通：集货发货单（多物流单号/箱数/物品清单/缩略图）→ 仓库点货差异协商 → 确认收货转入库单 → 库存台账（手动出入库/报损/效期预警）→ 零售价管理 → 销售单（请货/FEFO/折扣/支付/确认收货）→ 售后退货闭环 → 通知中心/审计/邮件桥（infra/mail-bridge）→ 部署文档（docs/deploy.md + go-live-checklist.md）。

**后续迭代候选（§11 风险 9 与 design.md 后续章节）**：盘点/库位/报表/汇率/B2C、数据导入（CK-10 已跳过）、邮件桥真实 SMTP 联调、Playwright 端到端。
