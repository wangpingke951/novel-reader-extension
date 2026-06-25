import type { PlasmoConfig } from "plasmo";

export const permissions = ["storage", "windows", "tabs"] as const;
export const host_permissions = ["https://*/*", "http://*/*"] as const;

const config: PlasmoConfig = {
  manifest: {
    name: "起点阅读",
    description: "在桌面小窗中阅读起点中文网小说章节",
    version: "0.2.0",
    permissions: ["storage", "windows", "tabs"],
    host_permissions: ["https://*/*", "http://*/*"],
  },
};

export default config;
