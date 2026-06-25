# 起点阅读 — 桌面透明窗小说阅读器

浏览器扩展 + 桌面透明悬浮窗，一键将起点中文网章节内容提取到桌面毛玻璃窗口中阅读，支持翻章、主题切换、字体缩放。

## 效果

```
┌─────────────────────────────────┐
│ 📖 章节标题              ─  □  ✕ │  窗口控制栏（拖拽区域）
├─────────────────────────────────┤
│        第X章 标题                │
│  段落内容...                     │
│  ...                            │
│                     — END —     │
│  [◀]  [A- 18 A+]  [🌙]  [▶]    │  底部阅读控制栏
└─────────────────────────────────┘
```

## 特性

- 📖 **一键提取** — 起点章节页右下角浮动按钮，点击即发送到桌面窗
- 🪟 **桌面透明窗** — 毛玻璃效果 + 置顶 + 无边框 + 可拖拽
- 🌙 **三主题** — 浅色 / 深色 / 羊皮纸
- 🔤 **字体缩放** — 14px ~ 32px 可调
- ◀▶ **章节导航** — 桌面窗内直接翻上一章 / 下一章
- 🔄 **回退方案** — 桌面程序未启动时，自动在页面内弹出悬浮阅读面板

## 架构

```
浏览器 (Chrome/Edge)                    桌面 (Python + WebView2)
┌──────────────────────┐    HTTP POST    ┌─────────────────────┐
│  content script      │ ──────────────→ │  Bottle HTTP Server │
│  - DOM 提取          │    :19876       │  - /api/content     │
│  - 浮动按钮          │                 │  - /api/pending-req │
│  - 轮询代理抓取      │ ←── poll ───── │                     │
│                      │                 │  pywebview 透明窗   │
└──────────────────────┘                 └─────────────────────┘
```

- **扩展**：[Plasmo](https://plasmo.com/) v0.90.5 + TypeScript（Manifest V3）
- **桌面**：[pywebview](https://pywebview.flowrl.com/) 6.2 + WebView2 + Win32 API
- **通信**：HTTP `127.0.0.1:19876`，content script 轮询实现翻章代理

## 快速开始

### 1. 安装桌面依赖

```bash
cd desktop
pip install -r requirements.txt
```

### 2. 启动桌面应用

```bash
python desktop/main.py
```

桌面透明窗会出现在屏幕上，等待浏览器发送章节内容。

### 3. 加载浏览器扩展

```bash
pnpm install
pnpm build
```

Chrome/Edge 打开 `chrome://extensions` → 开启「开发者模式」→ 「加载已解压的扩展」→ 选择 `build/chrome-mv3-pro/` 目录。

### 4. 开始阅读

1. 打开任意起点中文网章节页
2. 点击右下角 📖 浮动按钮
3. 章节内容出现在桌面透明窗中
4. 点击 `▶` 翻下一章，`◀` 返回上一章

## 项目结构

```
├── src/
│   └── contents/
│       └── novel-detector.ts    # 内容脚本：提取 + 轮询 + 面板
├── desktop/
│   ├── main.py                  # 桌面应用入口
│   ├── chapter_fetcher.py       # 章节抓取模块（备用）
│   └── requirements.txt
├── plasmo.config.ts
├── package.json
└── tsconfig.json
```

## 支持站点

- 起点中文网 (qidian.com)
- 晋江文学城 (jjwxc.net)
- 番茄小说 (fanqienovel.com)
- 哩哔轻小说 (linovelib.com)

## 已知限制

- 翻章功能需保持浏览器标签页打开（content script 运行中）
- VIP 付费章节翻章可能失败（需 Cookie，自动回退到手动浏览器导航）

## License

MIT
