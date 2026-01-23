/// <reference types="vite/client" />

declare global {
  interface Window {
    // 新浪行情脚本会写入此全局变量：var hq_str_sz000543="...";
    hq_str_sz000543?: string;
    hq_str_sh600000?: string;
    // 腾讯行情脚本会写入：v_sz000543="...";
    v_sz000543?: string;
    [k: string]: unknown;
  }
}

export {};


