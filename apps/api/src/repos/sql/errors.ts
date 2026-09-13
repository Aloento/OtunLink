// SQL 仓库层业务错误信号：路由层据此前缀映射为 409/400 与对应错误码。

// 路由层据此把仓库层异常映射为 409 与对应错误码。
export const SHIPMENT_STATE_CONFLICT = 'SHIPMENT_STATE_CONFLICT: only DRAFT shipments can be edited or sent';
export const SHIPMENT_TRACKING_CONFLICT = 'TRACKING_CONFLICT: carrier+tracking_no already exists';
// 点货/差异协商业务信号（路由层映射为对应错误码）。
export const COUNTING_STATE_CONFLICT =
  'COUNTING_STATE_CONFLICT: shipment is not in a countable state or version mismatch';
export const COUNT_LINE_INVALID = 'COUNT_LINE_INVALID: count line does not belong to the shipment';
export const REVIEW_ALREADY_PROCESSED =
  'REVIEW_ALREADY_PROCESSED: review already processed or pending review exists';
export const REVIEW_NO_DIFFERENCE = 'REVIEW_NO_DIFFERENCE: no discrepancy to review';
// 确认入库 / 发货退货业务信号（路由层映射为对应错误码）。
export const SHIPMENT_NOT_READY = 'SHIPMENT_NOT_READY: shipment is not READY or lines mismatch';
export const INBOUND_STATE_CONFLICT = 'INBOUND_STATE_CONFLICT: only DRAFT inbound orders can be posted';
export const RETURN_STATE_CONFLICT = 'RETURN_STATE_CONFLICT: shipment is not READY for return';
export const RETURN_ALREADY_PROCESSED =
  'RETURN_ALREADY_PROCESSED: return order already processed';
export const RETURN_LINE_INVALID = 'RETURN_LINE_INVALID: return line is invalid';
// 手动出入库 / 库存台账业务信号（路由层映射为对应错误码）。
export const OUTBOUND_STATE_CONFLICT =
  'OUTBOUND_STATE_CONFLICT: only DRAFT outbound orders can be posted';
export const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK: insufficient stock for outbound';
export const STOCK_BATCH_NOT_FOUND =
  'STOCK_BATCH_NOT_FOUND: no stock of the specified batch in the warehouse';
// 销售单业务信号（路由层映射为对应错误码）。
export const SALES_STATE_CONFLICT =
  'SALES_STATE_CONFLICT: sales order is not in a valid state for this operation';
export const SALES_LINE_INVALID = 'SALES_LINE_INVALID: sales order line is invalid';
// 零售售后退货业务信号（路由层映射为对应错误码）。
export const RETURN_QTY_EXCEEDED = 'RETURN_QTY_EXCEEDED: return qty exceeds returnable qty';
