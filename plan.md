# OtunLink 实施计划

> 本项目按「每轮一个 checkpoint、串行实现」推进。详见 [docs/checkpoints/README.md](docs/checkpoints/README.md) 与各 `ck-XX-*.md`。

## 工作流规则（强制）

1. **每个 checkpoint 由独立子 agent（全新上下文）实现**，主对话只做：启动子 agent、审查 diff、跑最小验证、验收、提交/推送。禁止在主对话中直接实现 checkpoint 代码。
2. **提交信息禁止附加 `Co-authored-by: Copilot` 等 vibe coding 相关内容**（仓库规则，见 docs/checkpoints/README.md 第 30 行）。
3. 一个 checkpoint 一个 commit，消息如 `feat(items): 物品目录与扫码 (ck-04)`。
4. 子 agent 每轮只读 `docs/checkpoints/README.md` + 自己的 `ck-XX-*.md` + `design.md` 相关章节；按「每轮统一要求」完成验证并更新状态。

## 进度

| 阶段 | Checkpoint | 状态 |
| ---- | ---------- | ---- |
| P0-P6 | ck-00 ~ ck-06 | ✅ 全部完成（ck-06 提交 d5a09ac，已推送 origin/main） |
| P7 | ck-07 确认入库（批次建档）+ 发货退货 | ⏳ 下一步 |
| P8a | ck-08a 库存台账 + 手动出入库 | 待启动 |
| P8b | ck-08b 报损 + 效期预警 + 零售价 | 待启动 |
| P9a | ck-09a 销售单 + 请货 + FEFO | 待启动 |
| P9b | ck-09b 零售售后退货闭环 | 待启动 |
| P10 | ck-10 通知/审计/邮件桥/上线 | 待启动 |

## 下一步（ck-07）

- 依据 [docs/checkpoints/ck-07-inbound.md](docs/checkpoints/ck-07-inbound.md) 与 design.md §5.2/§5.3 实现：
  - 仓库方确认收货（READY→已入库），自动创建入库单（批次建档：收货批次号/效期/供应商），支持备注与入库照片
  - 发货拒收 → 退货单闭环（仓库/集货处理）
- 由子 agent 实现，完成后主对话审查验收并提交。
