<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { HOLDERS, type Holder } from "./data/holders";
import { fetchTencentPriceByScript } from "./utils/tencentQuote";
import { fetchSinaPriceByScript } from "./utils/sinaQuote";

const STOCK_NAME = "皖能电力";
const SINA_SYMBOL = "sz000543";

const nowPrice = ref<number | null>(null);
const quoteTime = ref<string>("");
const loading = ref<boolean>(true);
const errorText = ref<string>("");

type MarketStatus = "OPEN" | "AUCTION" | "CLOSED";
const marketStatus = ref<MarketStatus>("CLOSED");

const clockText = ref<string>("—");
let clockBaseShiftedMs: number | null = null;
let clockBasePerf = 0;

type Pop = {
  id: number;
  text: string;
  cls: "pos" | "neg";
  stack: number;
};

const displayPrice = ref<number>(0);
const pricePops = ref<Pop[]>([]);

const displayPl = ref<Record<string, number>>({});
const plPops = ref<Record<string, Pop[]>>({});
const avatarOverride = ref<Record<string, string | undefined>>({});
const avatarResetTimer: Record<string, number | undefined> = {};

let popId = 1;
let priceRaf = 0;
const plRaf: Record<string, number> = {};
let lastQuotePriceCents: number | null = null;
const lastQuotePlCents: Record<string, number> = {};
let refreshing = false;
let resizeRaf = 0;
let testTimer: number | undefined;
let testRunning = false;

function updateStageScale() {
  // 以 1920x1080 为基准进行等比缩放（只缩小不放大），保证不同分辨率下布局比例一致
  const s = Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty("--stage-scale", String(s));
}

function scheduleUpdateStageScale() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(updateStageScale);
}

function getShanghaiNow(d = new Date()) {
  // 以 UTC+8 计算“北京时间/上海时间”，避免依赖浏览器时区
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  return new Date(utc + 8 * 60 * 60_000);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatShanghaiShifted(d: Date) {
  // d 是“上海时间偏移后的 Date”，直接用本地 getter 组合即可
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}-${mo}-${da} ${hh}:${mm}:${ss}`;
}

function setClockBaseFromShifted(shanghaiShifted: Date) {
  clockBaseShiftedMs = shanghaiShifted.getTime();
  clockBasePerf = performance.now();
}

function tickClock() {
  if (clockBaseShiftedMs == null) {
    setClockBaseFromShifted(getShanghaiNow());
  }
  const nowShifted = new Date(clockBaseShiftedMs! + (performance.now() - clockBasePerf));
  clockText.value = formatShanghaiShifted(nowShifted);
}

function updateMarketStatus() {
  // 仅按常规 A 股交易日/时间段判断（周末休盘；法定节假日不做额外判断）
  const sh = getShanghaiNow();
  const day = sh.getDay(); // 0=Sun ... 6=Sat
  if (day === 0 || day === 6) {
    marketStatus.value = "CLOSED";
    return;
  }
  const h = sh.getHours();
  const m = sh.getMinutes();
  const minute = h * 60 + m;

  // 竞价：09:15-09:25；14:57-15:00（收盘竞价）
  const AUCTION_1_START = 9 * 60 + 15;
  const AUCTION_1_END = 9 * 60 + 25;
  const OPEN_1_START = 9 * 60 + 30;
  const OPEN_1_END = 11 * 60 + 30;
  const OPEN_2_START = 13 * 60;
  const AUCTION_2_START = 14 * 60 + 57;
  const CLOSE = 15 * 60;

  if (minute >= AUCTION_1_START && minute < AUCTION_1_END) {
    marketStatus.value = "AUCTION";
  } else if (
    (minute >= OPEN_1_START && minute < OPEN_1_END) ||
    (minute >= OPEN_2_START && minute < AUCTION_2_START)
  ) {
    marketStatus.value = "OPEN";
  } else if (minute >= AUCTION_2_START && minute < CLOSE) {
    marketStatus.value = "AUCTION";
  } else {
    marketStatus.value = "CLOSED";
  }
}

const tagText = computed(() => {
  if (marketStatus.value === "AUCTION") return "竞价时间";
  if (marketStatus.value === "OPEN") return "实时行情";
  return "休盘时间";
});

const dotClass = computed(() => {
  if (marketStatus.value === "AUCTION") return "dot auction";
  if (marketStatus.value === "OPEN") return "dot live";
  return "dot closed";
});

const seeds = HOLDERS.map(() => ({
  x: Math.round((Math.random() * 2 - 1) * 26),
  y: Math.round((Math.random() * 2 - 1) * 18),
  d: Math.round(8 + Math.random() * 10)
}));

function calcTotalShares(h: Holder) {
  return h.lots.reduce((sum, l) => sum + l.shares, 0);
}
function calcTotalCost(h: Holder) {
  return h.lots.reduce((sum, l) => sum + l.price * l.shares, 0);
}

const holdersView = computed(() => {
  const p = nowPrice.value ?? 0;
  return HOLDERS.map((h, idx) => {
    const shares = calcTotalShares(h);
    const cost = calcTotalCost(h);
    const value = p * shares;
    const pl = value - cost;
    return {
      ...h,
      idx,
      shares,
      cost,
      pl
    };
  });
});

function fmtMoney(n: number) {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(2)}`;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function pushPopWith(target: Pop[], cls: Pop["cls"], text: string, stackStep = 18) {
  const id = popId++;
  // stack 固定写入，避免后续数组变化导致动画过程中“跳变/闪现”
  const stack = target.length * stackStep;
  target.push({ id, text, cls, stack });
  window.setTimeout(() => {
    const idx = target.findIndex((p) => p.id === id);
    if (idx >= 0) target.splice(idx, 1);
  }, 1650);
}

function pushPop(target: Pop[], delta: number, decimals = 2, stackStep = 18) {
  const cls: Pop["cls"] = delta >= 0 ? "pos" : "neg";
  const text = `${delta >= 0 ? "+" : ""}${delta.toFixed(decimals)}`;
  pushPopWith(target, cls, text, stackStep);
}

function tweenNumber(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (v: number) => void,
  cancelPrev: () => void,
  setRaf: (id: number) => void
) {
  cancelPrev();
  if (from === to) {
    onUpdate(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const v = from + (to - from) * easeOutCubic(t);
    onUpdate(v);
    if (t < 1) {
      setRaf(requestAnimationFrame(step));
    }
  };
  setRaf(requestAnimationFrame(step));
}

function getPlPopArr(name: string) {
  if (!plPops.value[name]) plPops.value[name] = [];
  return plPops.value[name]!;
}

function setAvatarTemp(name: string, url?: string) {
  if (!url) return;
  avatarOverride.value[name] = url;
  if (avatarResetTimer[name]) window.clearTimeout(avatarResetTimer[name]);
  avatarResetTimer[name] = window.setTimeout(() => {
    avatarOverride.value[name] = undefined;
    avatarResetTimer[name] = undefined;
  }, 2000);
}

function applyNewQuote(nextPrice: number) {
  const nextPriceCents = Math.round(nextPrice * 100);
  // 价格动画 & 飘字
  if (lastQuotePriceCents != null && nextPriceCents !== lastQuotePriceCents) {
    pushPop(pricePops.value, (nextPriceCents - lastQuotePriceCents) / 100, 2, 32);
  }
  tweenNumber(
    displayPrice.value,
    nextPriceCents / 100,
    650,
    (v) => (displayPrice.value = v),
    () => {
      if (priceRaf) cancelAnimationFrame(priceRaf);
      priceRaf = 0;
    },
    (id) => (priceRaf = id)
  );
  lastQuotePriceCents = nextPriceCents;

  // 盈亏动画 & 飘字（按 quote 的价格计算）
  for (const h of HOLDERS) {
    const shares = calcTotalShares(h);
    const cost = calcTotalCost(h);
    const nextPlCents = Math.round((nextPriceCents / 100) * shares * 100 - cost * 100);
    const prevPlCents = lastQuotePlCents[h.name];
    if (Number.isFinite(prevPlCents) && nextPlCents !== prevPlCents) {
      const deltaCents = nextPlCents - (prevPlCents as number);
      // 只有“真的变化”才产生冒泡，也只有这时才触发表情（红=笑，绿=哭）
      pushPop(getPlPopArr(h.name), deltaCents / 100, 2, 18);
      if (deltaCents > 0) setAvatarTemp(h.name, h.laughAvatarUrl);
      else if (deltaCents < 0) setAvatarTemp(h.name, h.cryAvatarUrl);
    }

    const nextPl = nextPlCents / 100;
    const cur = displayPl.value[h.name] ?? nextPl;
    tweenNumber(
      cur,
      nextPl,
      650,
      (v) => {
        displayPl.value[h.name] = v;
      },
      () => {
        if (plRaf[h.name]) cancelAnimationFrame(plRaf[h.name]);
        plRaf[h.name] = 0;
      },
      (id) => {
        plRaf[h.name] = id;
      }
    );
    lastQuotePlCents[h.name] = nextPlCents;
  }
}

function runFooterTest() {
  if (testRunning) return;
  testRunning = true;

  const fire = (cls: Pop["cls"]) => {
    // 股价：图标冒泡（金额为 0.00，但颜色/方向由 cls 决定）
    pushPopWith(pricePops.value, cls, "0.00", 32);

    // 盈亏：每个人冒泡 0.00，并触发表情（笑/哭）2 秒
    for (const h of HOLDERS) {
      pushPopWith(getPlPopArr(h.name), cls, "0.00", 18);
      if (cls === "pos") setAvatarTemp(h.name, h.laughAvatarUrl);
      else setAvatarTemp(h.name, h.cryAvatarUrl);
    }
  };

  fire("pos");
  if (testTimer) window.clearTimeout(testTimer);
  testTimer = window.setTimeout(() => {
    fire("neg");
    testRunning = false;
    testTimer = undefined;
  }, 3000);
}

let timer: number | undefined;
let statusTimer: number | undefined;
let clockTimer: number | undefined;
async function refreshPrice() {
  if (refreshing) return;
  refreshing = true;
  try {
    errorText.value = "";
    // 优先腾讯（更稳定，不容易遇到新浪 403）；失败则回退新浪
    const t = await fetchTencentPriceByScript(SINA_SYMBOL);
    const q = t ?? (await fetchSinaPriceByScript(SINA_SYMBOL));
    if (q?.now != null) {
      nowPrice.value = q.now;
      quoteTime.value = q.time ? `${q.date} ${q.time}` : q.date;
      applyNewQuote(q.now);
    } else if (nowPrice.value == null) {
      errorText.value = "行情获取失败（稍后会自动重试）";
    }
  } catch {
    if (nowPrice.value == null) errorText.value = "行情获取失败（稍后会自动重试）";
  } finally {
    loading.value = false;
    refreshing = false;
  }
}

onMounted(async () => {
  updateStageScale();
  window.addEventListener("resize", scheduleUpdateStageScale);
  // 初始化显示值（避免首次渲染为空导致跳变）
  for (const h of HOLDERS) displayPl.value[h.name] = 0;
  updateMarketStatus();
  statusTimer = window.setInterval(updateMarketStatus, 1000);
  tickClock();
  clockTimer = window.setInterval(tickClock, 1000);
  await refreshPrice();
  timer = window.setInterval(refreshPrice, 5000);
});
onUnmounted(() => {
  window.removeEventListener("resize", scheduleUpdateStageScale);
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  if (timer) window.clearInterval(timer);
  if (statusTimer) window.clearInterval(statusTimer);
  if (clockTimer) window.clearInterval(clockTimer);
  if (testTimer) window.clearTimeout(testTimer);
  for (const k of Object.keys(avatarResetTimer)) {
    const t = avatarResetTimer[k];
    if (t) window.clearTimeout(t);
  }
  if (priceRaf) cancelAnimationFrame(priceRaf);
  for (const k of Object.keys(plRaf)) {
    if (plRaf[k]) cancelAnimationFrame(plRaf[k]);
  }
});
</script>

<template>
  <div class="viewport">
    <div class="poster stage">
      <div class="bg" aria-hidden="true">
        <div class="grain" />
        <div class="glow g1" />
        <div class="glow g4" />
        <div class="glow g2" />
        <div class="glow g3" />
      </div>

    <header class="topbar">
      <div class="topbar-inner">
        <div class="top-image">
          <div class="quote-overlay">
            <div class="tag">
              <span :class="dotClass" />
              <span class="tag-text">{{ tagText }}</span>
            </div>
            <div class="name-row">
              <div class="name">{{ STOCK_NAME }}</div>
              <div class="meta meta-inline">
                <span class="meta-item">代码：{{ SINA_SYMBOL }}</span>
                <span class="meta-sep">·</span>
                <span class="meta-item">时间：{{ clockText || "—" }}</span>
              </div>
            </div>

            <div class="price-wrap" :class="{ loading: loading && nowPrice == null }">
              <div class="price">
                <span class="yen">¥</span>
                <span class="num">{{ nowPrice == null ? "--.--" : displayPrice.toFixed(2) }}</span>
              </div>
              <div class="pops price-pops" aria-hidden="true">
                <div v-for="p in pricePops" :key="p.id" class="pop" :class="p.cls" :style="{ '--stack': p.stack + 'px' }">
                  <img class="pop-icon" :src="p.cls === 'pos' ? '/up.svg' : '/down.svg'" alt="" />
                </div>
              </div>
            </div>
            <div v-if="errorText" class="error">{{ errorText }}</div>
          </div>
        </div>
      </div>
    </header>

    <section class="holders holders-overlay">
      <div
        v-for="h in holdersView"
        :key="h.name"
        class="holder-card float"
        :style="{
          '--fx': seeds[h.idx].x + 'px',
          '--fy': seeds[h.idx].y + 'px',
          '--fd': seeds[h.idx].d + 's'
        }"
      >
        <div class="avatar-wrap" :class="{ has: !!h.avatarUrl }" aria-hidden="true">
          <img v-if="(avatarOverride[h.name] || h.avatarUrl)" :src="(avatarOverride[h.name] || h.avatarUrl)!" alt="" />
        </div>

        <div class="holder-head">
          <div class="who">
            <div class="who-name">{{ h.name }}</div>
            <div class="who-sub">{{ h.shares }} 股</div>
          </div>
        </div>

        <div class="money">
          <div class="row">
            <span class="label">浮动盈亏</span>
            <span class="val-wrap">
              <span
                class="val"
                :class="{
                  pos: (displayPl[h.name] ?? h.pl) >= 0,
                  neg: (displayPl[h.name] ?? h.pl) < 0
                }"
              >
                {{ fmtMoney(displayPl[h.name] ?? h.pl) }}
              </span>
              <span class="pops pl-pops" aria-hidden="true">
                <span v-for="p in plPops[h.name] || []" :key="p.id" class="pop" :class="p.cls" :style="{ '--stack': p.stack + 'px' }">
                  {{ p.text }}
                </span>
              </span>
            </span>
          </div>
        </div>

        <details class="lots" :open="false">
          <summary class="lots-summary">
            <span class="lots-title">买入明细</span>
            <span class="lots-mini">共 {{ h.lots.length }} 笔</span>
          </summary>
          <div class="lots-body">
            <div v-for="(l, i) in h.lots" :key="i" class="lot">
              <span class="lot-left">¥{{ l.price.toFixed(2) }}</span>
              <span class="lot-right">{{ l.shares }} 股</span>
            </div>
          </div>
        </details>
      </div>
    </section>

    <main class="content">
      <!-- holders 已改为全局浮层（覆盖在标题图上方），这里保留主体区域用于占位/后续扩展 -->
    </main>

    <footer class="footer">
      <div class="footer-inner">
        <span class="brand" @click="runFooterTest">理智投资，杜绝上头</span>
        <!-- <span class="note">头像与标题图均为占位，已预留固定尺寸。</span> -->
      </div>
    </footer>
    </div>
  </div>
</template>


