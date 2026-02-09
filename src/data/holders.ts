export type BuyLot = {
  price: number;
  shares: number;
};

export type Trade = {
  // 交易记录仅用于展示，不参与当前持仓/盈亏计算（持仓仍由 lots 决定）
  side: "BUY" | "SELL";
  price: number;
  shares: number;
};

export type Holder = {
  name: string;
  avatarUrl?: string; // 默认头像
  cryAvatarUrl?: string; // 亏损触发：哭脸头像
  laughAvatarUrl?: string; // 盈利触发：笑脸头像（你后续补图）
  lots: BuyLot[];
  trades?: Trade[];
};

// 购买信息：按你的需求直接写死为 JSON
export const HOLDERS: Holder[] = [
  {
    name: "邓锐",
    avatarUrl: "/deng.jpg",
    cryAvatarUrl: "/deng-cry.jpg",
    laughAvatarUrl: "/deng-laugh.jpg",
    lots: [
      { price: 8.71, shares: 1700 },
      { price: 8.72, shares: 1700 },
      { price: 8.66, shares: 1200 }
    ],
    trades: [
      { side: "SELL", price: 8.06, shares: 2050 },
      { side: "BUY", price: 7.95, shares: 2100 }
    ]
  },
  {
    name: "汤银海",
    avatarUrl: "/tang.jpg",
    cryAvatarUrl: "/tang-cry.jpg",
    laughAvatarUrl: "/tang-laugh.jpg",
    lots: [
      { price: 8.71, shares: 1700 },
      { price: 8.7, shares: 1900 }
    ],
    trades: [
      { side: "SELL", price: 8.06, shares: 2050 },
      { side: "BUY", price: 7.95, shares: 2100 }
    ]
  },
  {
    name: "张伟",
    avatarUrl: "/zhangwei.jpg",
    cryAvatarUrl: "/zhangwei-cry.jpg",
    laughAvatarUrl: "/zhangwei-laugh.jpg",
    // 持仓：49200 股，买入均价 8.5945（来自截图）
    lots: [{ price: 8.5945, shares: 49200 }]
  },
  {
    name: "舒海林",
    avatarUrl: "/shu.jpg",
    cryAvatarUrl: "/shu-cry.jpg",
    laughAvatarUrl: "/shu-laugh.jpg",
    lots: [{ price: 8.677, shares: 3500 }]
  },
  {
    name: "彭宇",
    avatarUrl: "/peng.jpg",
    cryAvatarUrl: "/peng-cry.jpg",
    laughAvatarUrl: "/peng-laugh.jpg",
    lots: [{ price: 8.692, shares: 23000 }]
  }
];


