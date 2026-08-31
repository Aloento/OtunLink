# ck-04（P4）物品目录 + 图片 + 相机扫码

## 目标
实现全局物品目录（可复用），含图片压缩上传（全前端、后端仅校验）、缩略图、手机相机扫码即定位。

## 范围
- 🔨 items CRUD + 列表：搜索（名称/条码，`GET /items?q=`）、分页（≤50/页）、规格字段（spec_unit ∈ PIECE/BAG/BOX/PACK/SET/OTHER + inner_unit/inner_count）、`is_perishable` 开关、条码（active 部分唯一）
- 🔨 图片管线（design.md §8.1）：
  - 前端 Canvas 压缩：原图最长边 ≤1600px、JPEG ≤2MB + 生成 320px 缩略图；压缩在前端完成
  - `POST /files`（multipart）：后端仅校验魔数/尺寸/类型 → S3 私有桶
  - `GET /files/:id/url` 15 分钟签名 URL；缩略图与展示图分离
- 🔨 相机扫码（design.md §8.7）：`BarcodeDetector`（原生）→ 失败回退 `@zxing/browser`；扫码成功 → `GET /items/by-barcode?code=` → 定位/选中该物品；失败提示；相机用后即释放（暂停/关闭）
- 🔨 UI：`/items` 列表（搜索+扫码按钮）、新建/编辑表单、图片上传（压缩进度/预览）、`/items/:id` 详情
- 🔨 测试：压缩/校验单测（前端工具函数）、by-barcode 查找 API 测试

## 不做
- 发货单/库存等业务引用（后续 checkpoint）
- 批量导入（ck-10 可选）

## 验收
1. 新增物品可保存；同名/同条码搜索可复用；条码重复（active）被拒
2. 上传图片：前端压缩生效（体积/尺寸达标），缩略图生成，S3 存储，签名 URL 可读
3. 附带测试或手工验证：上传非图片/超大文件被后端拒绝
4. 扫码：桌面（摄像头/录入）与手机真机（如可得）验证定位；无摄像头环境走 zxing 回退或手动输入条码
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§4.2 物品、§8.1 图片、§8.7 扫码、§6.1/§6.2 页面与 API。
