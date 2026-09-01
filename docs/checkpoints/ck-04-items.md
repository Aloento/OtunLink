# ck-04（P4）物品目录 + 图片 + 相机扫码

## 目标
实现全局物品目录（可复用），含图片压缩上传（全前端、后端仅校验）、缩略图、手机相机扫码即定位。

## 范围
- ✅ items CRUD + 列表：搜索（名称/条码，`GET /items?q=`）、分页（≤50/页）、规格字段（spec_unit ∈ PIECE/BAG/BOX/PACK/SET/OTHER + inner_unit/inner_count）、`is_perishable` 开关、条码（active 部分唯一）
- ✅ 图片管线（design.md §8.1）：
  - 前端 Canvas 压缩：原图最长边 ≤1600px、JPEG ≤2MB + 生成 320px 缩略图；压缩在前端完成
  - `POST /files`（multipart）：后端仅校验魔数/尺寸/类型 → S3 私有桶
  - `GET /files/:id/url` 15 分钟签名 URL；缩略图与展示图分离
- ✅ 相机扫码（design.md §8.7）：`BarcodeDetector`（原生）→ 失败回退 `@zxing/browser`；扫码成功 → `GET /items/by-barcode?code=` → 定位/选中该物品；失败提示；相机用后即释放（暂停/关闭）
- ✅ UI：`/items` 列表（搜索+扫码按钮）、新建/编辑表单、图片上传（压缩进度/预览）、`/items/:id` 详情
- ✅ 测试：压缩/校验单测（前端工具函数）、by-barcode 查找 API 测试

## 不做
- 发货单/库存等业务引用（后续 checkpoint）
- 批量导入（ck-10 可选）

## 验收
1. ✅ 新增物品可保存；同名/同条码搜索可复用；条码重复（active）被拒（API 测试覆盖 by-barcode 与 409 冲突）
2. ⚠️ 上传图片：前端压缩生效（体积/尺寸达标）、缩略图生成、S3 存储、签名 URL 可读 —— 后端校验与签名 URL 已单测；S3 真实上传未在本机联调（见遗留问题）
3. ✅ 上传非图片/超大文件被后端拒绝（sniffImage 魔数 + ≤5MB + Content-Length 校验，files.test.ts 覆盖）
4. ⚠️ 扫码：桌面/手机真机未实测（BarcodeDetector 需 https/localhost 与真摄像头）；无摄像头环境走 zxing 回退 + 手动输入条码路径已实现并有静态类型声明
5. ✅ `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§4.2 物品、§8.1 图片、§8.7 扫码、§6.1/§6.2 页面与 API。

## 完成情况

✅ 完成（commit 见 git log，feat(items) + docs(ck-04)）。

- API（apps/api）：`routes/items.ts`（CRUD + `/by-barcode` 搜索 + `/items/:id/images` 挂图，条码 active 唯一 → 409 `BARCODE_CONFLICT`）、`routes/files.ts`（multipart 上传 + `/files/:id/url` 15 分钟预签名）、`lib/image.ts`（JPEG/PNG/WebP 魔数 + 尺寸探测）、`lib/s3.ts`（aws4fetch AwsClient 封装 putObject/presignedGetUrl）；memory/sql 仓储补齐 items/files；新增错误码 `BARCODE_CONFLICT/FILE_INVALID/FILE_TOO_LARGE/STORAGE_UNAVAILABLE`。
- Web（apps/web）：`pages/items/*`（列表/表单/详情）、`components/{ImageUpload,FileImage,ScannerDialog}`、`lib/image-compress.ts`（Canvas 压缩最长边 ≤1600、JPEG 质量适配 ≤2MB、320px 缩略图）、`lib/barcode.ts`（BarcodeDetector → @zxing/browser 回退，自管理 MediaStream 保证 track.stop 释放）、`types/barcode.d.ts`（TS7 lib.dom 无 BarcodeDetector，手动声明）。
- 权限：物品目录全局共享，`ITEMS_READ` 全角色，`ITEMS_WRITE` 全角色（COLLECTOR/WAREHOUSE/RETAILER/ADMIN），按 design.md §3.2 矩阵。 **✅ 2026-09-01 已按评审语义重实现**：本 checkpoint 的物品权限已按 `docs/qa/rbac-matrix-vs-semantics.md` §1.1 评审结论重实现（ck-04 物品权限：RETAILER 移除 ITEMS_WRITE、仅保留 ITEMS_READ；目录维护仅 COLLECTOR/WAREHOUSE/ADMIN），设计文档以 design.md v1.4 为准。
- 验证：`pnpm -r typecheck` ✅ / `pnpm -r test` ✅（web 40、shared 16、db 8、api 45）/ `pnpm -r build` ✅（api 经 `wrangler deploy --dry-run`）。`wrangler dev` 本地起服后 curl：`/api/v1/items`、`/items/by-barcode`、`/files` POST、`/files/:id/url` 未带 token 均返回 401 `UNAUTHORIZED`。

### 遗留问题 / 与任务差异

1. S3 真实上传未联调：本机无有效 Entra 用户令牌，无法走通「前端压缩 → POST /files → S3 putObject → 预签名读取」全链路；后端 putObject/presign 仅经单测（S3 mock）验证。生产环境需以真实凭据做一次端到端上传验证。
2. BarcodeDetector 仅 https/localhost 可用，且 TS7 `lib.dom.d.ts` 未含该类型（已手动声明于 `apps/web/src/types/barcode.d.ts`）；本机无摄像头，桌面/手机真机扫码未实测，已保证 zxing 回退与手动输入条码路径可用。
3. 图片压缩中缩略图默认 JPEG 输出；非 JPEG 原图（PNG/WebP）主图按最长边压缩后以原 MIME 保存（≤2MB 控制经质量适配），若原图为 WebP 且浏览器不支持编码时回退 PNG——极旧浏览器边缘情况。
4. 后端尺寸探测（`lib/image.ts`）不校验像素 ≤1600/320（压缩为前端责任），仅校验魔数、文件类型与 ≤5MB；若绕过前端直接上传大尺寸原图，后端不会拒绝。
5. items 无 DELETE（design 未要求），历史数据仅靠 `active=false` 软失效；前端表单编辑复用同一页（新建/编辑二合一）。
