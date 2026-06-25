import type { PlasmoConfig } from "plasmo";

const config: PlasmoConfig = {
  manifest: {
    name: "起点阅读",
    description: "在桌面小窗中阅读起点中文网小说章节",
    version: "0.2.0",
    host_permissions: [
      "https://*/*",
      "http://*/*",
      "http://127.0.0.1/*",
      "http://localhost/*",
    ],
  },
};

export default config;
