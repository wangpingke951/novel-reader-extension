# CLAUDE.md

## 项目概述

起点阅读桌面窗 — 浏览器扩展 + 桌面透明悬浮窗。在起点中文网等小说站点一键提取章节内容到桌面毛玻璃窗口阅读。

## 架构

```
浏览器 (Chrome/Edge 扩展)                      桌面 (Python + WebView2)
┌──────────────────────────────┐   HTTP       ┌──────────────────────┐
│ Background Service Worker    │ ←── poll ── │ Bottle HTTP Server   │
│ - index.ts                   │  GET :19876 │ - main.py            │
│ - 轮询 /api/pending-request  │             │ - _pending_url 队列  │
│ - setInterval 300ms (不受    │             │                      │
│   标签页节流影响)             │             │ pywebview 透明窗     │
└──────┬───────────────────────┘             └──────────────────────┘
       │ port.postMessage({type:"DO_FETCH", url})
       ▼
┌──────────────────────────────┐  HTTP POST  ┌──────────────────────┐
│ Content Script               │ ──────────→ │ /api/content         │
│ - novel-detector.ts          │  :19876     │ window.evaluate_js() │
│ - DOM 提取 / 浮动按钮        │             │ updateContent(...)   │
│ - fetchAndSendChapter(url)   │             │                      │
│ - 持有浏览器 Cookie          │             │                      │
└──────────────────────────────┘             └──────────────────────┘
```

- **扩展**：[Plasmo](https://plasmo.com/) v0.90.5 + TypeScript · Manifest V3
- **桌面**：[pywebview](https://pywebview.flowrl.com/) + WebView2 + Win32 API · Bottle HTTP
- **通信**：HTTP localhost + `chrome.runtime.Port` 长连接。Background SW 轮询 `/api/pending-request`，通过端口消息分发给 content script 抓取章节（浏览器持有 Cookie，可访问 VIP 章节）

## 项目结构

```
├── src/
│   ├── contents/
│   │   └── novel-detector.ts    # 起点/晋江/番茄/哩哔 — DOM 提取 + 浮动按钮 + 端口连接
│   ├── background/
│   │   └── index.ts             # SW: 轮询待请求队列 + 端口管理中继 + 消息转发
│   └── lib/
│       ├── constants.ts         # 所有阈值/URL/选择器常量
│       ├── extractor.ts         # DOM 提取 + 清洗 + 导航链接
│       ├── desktop-client.ts    # 发送到桌面 + 代理抓取（由 SW 触发）
│       └── ui.ts               # Toast + 浮动按钮 + Shadow DOM 阅读面板
├── desktop/
│   ├── main.py                  # 桌面窗入口（port 19876）
│   ├── reader_ui.html           # 桌面窗 HTML/CSS/JS UI
│   ├── start_qidian.vbs         # 一键启动（pythonw.exe 无控制台）
│   └── requirements.txt         # Python 依赖
├── package.json                 # pnpm + Plasmo
├── plasmo.config.ts             # 扩展 manifest 配置
└── tsconfig.json
```

## 关键文件

### 扩展端 (TypeScript)

| 文件 | 作用 |
|------|------|
| [src/background/index.ts](src/background/index.ts) | Background Service Worker。核心：轮询 `/api/pending-request`（300ms 快 / 5s 慢自适应）、端口管理（`chrome.runtime.Port` 长连接保活）、消息转发（发现待请求 URL → `port.postMessage` 分发给 content script）。**轮询在 SW 中运行，不受标签页节流影响**。 |
| [src/contents/novel-detector.ts](src/contents/novel-detector.ts) | Content script 入口。打开 `keepAlive` 端口连接 SW，监听 `DO_FETCH` 消息调用 `fetchAndSendChapter()`、浮动按钮注入、SPA 导航支持。**不再自行轮询**。 |
| [src/lib/desktop-client.ts](src/lib/desktop-client.ts) | `sendToDesktopApp()` HTTP POST + `fetchAndSendChapter()` 代理抓取（由 SW 消息触发，运行在 content script 上下文中持有 Cookie） |
| [src/lib/extractor.ts](src/lib/extractor.ts) | `extract()` + `cleanAndBuildHtml()` + `extractNavigationUrls()` + `extractFull()` |
| [src/lib/constants.ts](src/lib/constants.ts) | 所有阈值、URL、延时、选择器、正则常量 |
| [src/lib/ui.ts](src/lib/ui.ts) | Toast、浮动按钮注入、Shadow DOM 悬浮阅读面板（桌面未启动时的回退方案） |

### 桌面端 (Python)

| 文件 | 作用 |
|------|------|
| [desktop/main.py](desktop/main.py) | 桌面窗。Bottle 服务 + `ReaderApi` JS API + Win32 透明/置顶 + HWND 缓存 |
| [desktop/reader_ui.html](desktop/reader_ui.html) | 桌面窗 HTML/CSS/JS UI（从 main.py 内联字符串中提取） |

## 开发命令

```bash
# 扩展开发
pnpm install          # 安装依赖
pnpm dev              # Plasmo 开发模式（热更新）
pnpm build            # 生产构建 → build/chrome-mv3-pro/
pnpm package          # 打包为 .zip

# 桌面应用
pip install -r desktop/requirements.txt
python desktop/main.py        # 启动桌面窗
```

## 重要技术细节

### pywebview 的 localStorage 限制（关键！）

`webview.create_window(html=READING_HTML)` 使用 `NavigateToString()` 加载 HTML，**该模式禁止访问 `window.localStorage`**，会抛出 `SecurityError: Access is denied for this document`。

解决方案：使用内存存储包装器 `_ls`：

```javascript
var __mem = {};
var _ls = {
  getItem: function(k) { return __mem[k] || null; },
  setItem: function(k, v) { __mem[k] = v; }
};
```

所有需要持久化的设置（如透明度滑块值）都通过 `_ls` 读写。**不要在新代码中使用 `localStorage`**。

### Win32 透明窗口

桌面窗通过 Win32 API 设置分层窗口实现透明 + 置顶：
- `SetWindowLongW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED | WS_EX_TOPMOST)`
- `SetWindowPos(hwnd, HWND_TOPMOST, ...)` 确保置顶
- 窗口标题用作 `FindWindowW` 的查找键（"起点阅读"）

### 拖拽系统

起点窗使用**统一事件系统**：单个 `document` 级别的 `mousedown → mousemove → mouseup` 处理拖拽和 8 方向边框缩放，通过 `action` 状态变量（`'drag'` | `'resize'`）区分模式。

优先级：**交互元素（BUTTON/INPUT/SELECT/TEXTAREA）→ 工具栏拖拽 → 边框缩放**

工具栏检测使用 `e.target.closest(".toolbar")`，缩放边缘检测使用 6px 边界阈值（`getResizeDir()`）。

### 透明度实现

通过 CSS 自定义属性 `--bg-alpha` 控制 wrapper 背景透明度：
- 所有 3 个主题（dark/light/sepia）的 `--bg` 都引用 `var(--bg-alpha)`
- 滑块值 20-95，通过 JS `document.documentElement.style.setProperty("--bg-alpha", alpha)` 动态更新
- 透明度设置通过 `_ls` 内存存储跨会话保持

### 翻章代理轮询（端口 + SW 架构）

桌面窗不能直接 HTTP 请求章节页面（缺乏 Cookie），所以通过 Background SW 轮询 + Content Script 端口消息实现代理：

1. 用户点击桌面窗「下一章」→ JS 调用 `window.pywebview.api.request_chapter(url)` → Python 设置 `_pending_request_url`
2. Background SW 轮询 `GET /api/pending-request`（300ms 快速 / 5s 慢速自适应）
3. SW 发现 URL → 通过 `port.postMessage({ type: "DO_FETCH", url })` 分发给 content script
4. Content script 用浏览器 Cookie `fetch()` 章节页面 → 提取内容 → POST 到 `/api/content`

**关键设计**：轮询在 Background SW 中运行，不受标签页最小化/隐藏的 `setInterval` 节流影响。Content script 通过 `chrome.runtime.connect({ name: "keepAlive" })` 长连接端口保活，同时接收抓取指令。端口断开时自动重连。SW 在所有端口断开后自动停止轮询节省资源。

### 内容提取策略

起点 (`novel-detector.ts`)：
- 标题：`#reader-content h3` → `.j_chapterName` → `h1` → `h2` → `h3`
- 正文：优先 `#reader-content .enable-review`（起点新版 Tailwind 纯正文容器），回退到多个选择器中文本最长者
- 清洗：移除噪声标签 → 移除纯数字叶子节点 → 提取 `<p>` 段落 → 合并短段 → 构建干净 HTML

### SPA 导航支持

通过 `MutationObserver` + `pushState`/`replaceState` 拦截 + `popstate` 监听，确保 SPA 页面内导航时浮动按钮和端口连接保持活跃。

## 注意事项

- **`ENABLE_TEST_ALL = false`** — 调试时设为 `true` 可在任意页面显示浮动按钮
- **回退面板** — 桌面程序未连接时，起点扩展自动在页面内弹出 Shadow DOM 悬浮阅读面板（`injectReadingPanel()`）
- **不要重新引入 `localStorage`** — 在桌面窗的 HTML 中只能用 `_ls`，否则 JS 直接崩溃
- **`min_size=(300, 350)`** — 窗口最小尺寸
- **`easy_drag=False`** — 关闭 pywebview 自带拖拽，全部由自定义 JS + Win32 API 接管
