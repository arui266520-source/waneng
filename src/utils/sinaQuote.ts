type SinaQuote = {
  raw: string;
  name: string;
  now: number;
  date: string;
  time: string;
};

function parseSinaHqRaw(raw: string): SinaQuote | null {
  // 格式示例：
  // "皖能电力,8.65,8.70,8.72,8.75,8.62,8.71,8.72,....,2026-01-21,15:00:03,00"
  const parts = raw.split(",");
  if (parts.length < 32) return null;
  const name = parts[0] || "";
  const now = Number(parts[3]);
  const date = parts[30] || "";
  const time = parts[31] || "";
  if (!Number.isFinite(now)) return null;
  return { raw, name, now, date, time };
}

export async function fetchSinaPriceByScript(symbol: string): Promise<SinaQuote | null> {
  // 使用“脚本注入”方式获取开源行情数据（避免 CORS fetch 限制）
  // symbol 例：sz000543
  const globalKey = `hq_str_${symbol}`;

  return await new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://hq.sinajs.cn/list=${encodeURIComponent(symbol)}&_=${Date.now()}`;

    const cleanup = () => {
      s.onload = null;
      s.onerror = null;
      if (s.parentNode) s.parentNode.removeChild(s);
    };

    s.onload = () => {
      // 脚本执行后会写 window[globalKey] = "..."
      const raw = String((window as unknown as Record<string, unknown>)[globalKey] ?? "");
      cleanup();
      resolve(raw ? parseSinaHqRaw(raw) : null);
    };
    s.onerror = () => {
      cleanup();
      resolve(null);
    };

    document.head.appendChild(s);
  });
}


