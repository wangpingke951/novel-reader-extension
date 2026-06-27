import type { PlasmoConfig } from "plasmo";

const config: PlasmoConfig = {
  manifest: {
    name: "起点阅读桌面窗",
    description: "在桌面小窗中阅读起点小说",
    version: "0.3.0",
    host_permissions: [
      "https://*/*",
      "http://*/*",
      "http://127.0.0.1/*",
      "http://localhost/*",
    ],
  },
};

export default config;
