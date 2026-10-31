import { useCallback, useEffect, useState } from 'react';

// 销售单「拣货勾选」：仓库取货时的核对清单。
//
// 为什么存在本机而不是数据库：拣货是一个人的现场动作，勾选要即时、零网络、
// 手机锁屏/切后台再回来也还在。因此按 订单 + 浏览器 存 localStorage，
// 不写后端、不参与单据状态机（勾选不影响任何业务校验与库存）。
//
// 键名带订单 id：不同销售单互不干扰；换设备/换浏览器需要重新勾选。

const STORAGE_PREFIX = 'otunlink.sales.picked.';

function storageKey(orderId: string): string {
  return `${STORAGE_PREFIX}${orderId}`;
}

/** 读取某单的勾选行 id（坏数据/无存储时返回空数组，不抛异常）。导出供测试。 */
export function readPicked(orderId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(orderId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return []; // 隐私模式/存储损坏：退化为空勾选，不影响页面可用性。
  }
}

/** 写入某单的勾选行 id（写失败静默降级为「本次会话有效」）。导出供测试。 */
export function writePicked(orderId: string, lineIds: Iterable<string>): void {
  try {
    localStorage.setItem(storageKey(orderId), JSON.stringify([...lineIds]));
  } catch {
    // 写失败只是失去持久化，本次会话内勾选仍然有效。
  }
}

export interface PickedLines {
  picked: ReadonlySet<string>;
  count: number;
  toggle: (lineId: string) => void;
  clear: () => void;
}

/** 读取/切换某张销售单的拣货勾选（同一浏览器内持久化）。 */
export function usePickedLines(orderId: string | undefined): PickedLines {
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(orderId ? readPicked(orderId) : []),
  );

  // 切换到另一张销售单时重新加载，避免沿用上一单的勾选。
  useEffect(() => {
    setPicked(new Set(orderId ? readPicked(orderId) : []));
  }, [orderId]);

  const toggle = useCallback(
    (lineId: string) => {
      if (!orderId) return;
      const next = new Set(picked);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      setPicked(next);
      writePicked(orderId, next);
    },
    [orderId, picked],
  );

  const clear = useCallback(() => {
    if (!orderId) return;
    setPicked(new Set());
    writePicked(orderId, []);
  }, [orderId]);

  return { picked, count: picked.size, toggle, clear };
}
