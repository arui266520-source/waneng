type TencentQuote = {
  raw: string;
  name: string;
  now: number;
  date: string;
  time: string;
};

function parseYYYYMMDDHHmmss(ts: string) {
  // 20260121150003 -> 2026-01-21 15:00:03
  const y = ts.slice(0, 4);
  const m = ts.slice(4, 6);
  const d = ts.slice(6, 8);
  const hh = ts.slice(8, 10);
  const mm = ts.slice(10, 12);
  const ss = ts.slice(12, 14);
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}:${ss}` };
}

function parseTencentV(raw: string): TencentQuote | null {
  // 格式示例（~ 分隔）：
  // v_sz000543="51~皖能电力~000543~8.72~8.70~8.71~...~20260121150003~...";
  const parts = raw.split("~");
  if (parts.length < 6) return null;
  const name = parts[1] || "";
  const now = Number(parts[3]);
  if (!Number.isFinite(now)) return null;

  // 时间字段位置可能随版本变化：这里用“扫描 14 位时间戳”做兼容
  let date = "";
  let time = "";
  for (const p of parts) {
    if (/^\d{14}$/.test(p)) {
      const t = parseYYYYMMDDHHmmss(p);
      date = t.date;
      time = t.time;
      break;
    }
  }
  return { raw, name, now, date, time };
}

export async function fetchTencentPriceByScript(symbol: string): Promise<TencentQuote | null> {
  // symbol 例：sz000543
  const globalKey = `v_${symbol}`;

  return await new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    // 随便带个随机数，避免缓存；返回是一段 JS：v_xxx="...";
    s.src = `https://qt.gtimg.cn/q=${encodeURIComponent(symbol)}&_=${Date.now()}`;

    const cleanup = () => {
      s.onload = null;
      s.onerror = null;
      if (s.parentNode) s.parentNode.removeChild(s);
    };

    s.onload = () => {
      const v = String((window as unknown as Record<string, unknown>)[globalKey] ?? "");
      cleanup();
      resolve(v ? parseTencentV(v) : null);
    };
    s.onerror = () => {
      cleanup();
      resolve(null);
    };

    document.head.appendChild(s);
  });
}


