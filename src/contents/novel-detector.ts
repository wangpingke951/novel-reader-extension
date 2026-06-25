import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
};

const isNovelSite = (): boolean => {
  const h = window.location.hostname;
  return h.includes("qidian.com") || h.includes("jjwxc.net") ||
    h.includes("fanqienovel.com") || h.includes("linovelib.com");
};

/* ─── 提取 ─── */

const SELECTORS = [
  // 起点新版 (Tailwind 结构)
  "#reader-content .enable-review",
  "#reader-content",
  // 起点旧版
  ".read-content", ".j_readContent", "#chaptercontent",
  // 通用
  ".chapter-content", ".chapter-article", ".reading-content",
  ".noveltext", ".novelbody", ".article-content", "#article",
];

const TITLE_SELECTORS = [
  // 起点新版
  "#reader-content h3",
  "#reader-content h2",
  "#reader-content h1",
  // 起点旧版
  ".j_chapterName", "h3.j_chapterName", ".content-wrap h3",
  // 通用
  "h1", "h2", "h3", ".chapter-title", ".text-title",
];

function extract(): { title: string; content: string } | null {
  // 找标题
  let title = "";
  for (const sel of TITLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      title = el.textContent.trim();
      break;
    }
  }
  if (!title) title = document.title || "未命名章节";

  // 找内容区 — .enable-review 优先级最高，直接使用
  let container: Element | null = null;

  // 优先：起点新版 .enable-review（纯正文，不含元数据）
  const reviewEl = document.querySelector("#reader-content .enable-review");
  if (reviewEl && (reviewEl.textContent?.trim().length || 0) > 50) {
    container = reviewEl;
  }

  // 后备：遍历选择器取文本最长者
  if (!container) {
    let bestLen = 0;
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || "";
      if (text.length > bestLen) {
        bestLen = text.length;
        container = el;
      }
    }
  }

  if (!container) return null;

  // 清洗 DOM → 重建干净 HTML
  const content = cleanAndBuildHtml(container);
  if (!content) return null;

  return { title, content };
}

/**
 * 清洗 DOM：移除噪音元素，提取正文段落，重建干净 HTML
 */
function cleanAndBuildHtml(rawElement: Element): string | null {
  const clone = rawElement.cloneNode(true) as HTMLElement;

  // 1. 只移除明确的非内容标签（不用 class 关键词匹配，避免误删 .enable-review 等容器）
  const NOISE_TAGS = [
    "style", "script", "svg", "img", "button", "input",
    "canvas", "iframe", "noscript", "video", "audio",
  ];
  for (const tag of NOISE_TAGS) {
    clone.querySelectorAll(tag).forEach((n) => n.remove());
  }

  // 2. 移除纯数字的叶子节点（如评论数 "2"、"72" 等）
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    if (el.children.length === 0) {
      const text = el.textContent?.trim() || "";
      if (text.length <= 4 && /^\d+$/.test(text)) {
        toRemove.push(el);
      }
    }
  }
  toRemove.forEach((el) => el.remove());

  // 3. 从 DOM <p> 标签提取段落（保留原始分段）
  const pEls = clone.querySelectorAll("p");
  const paragraphs: string[] = [];

  for (const pEl of pEls) {
    const text = pEl.textContent?.replace(/[\s　]+/g, " ").trim() || "";
    // 过滤纯数字/空段
    if (!text || text.length < 2 || /^\d+$/.test(text)) continue;
    paragraphs.push(text);
  }

  // 如果 <p> 标签不够（<3 个），回退到 textContent 拆段
  if (paragraphs.length < 3) {
    const rawText = clone.textContent || "";
    const fallback = rawText
      .split(/\n\s*\n|\n{2,}/)
      .map((p) => p.replace(/[\s　]+/g, " ").trim())
      .filter((p) => p.length >= 2 && !/^\d+$/.test(p));
    // 用 fallback 替换
    paragraphs.length = 0;
    paragraphs.push(...fallback);
  }

  if (paragraphs.length === 0) return null;

  // 4. 相邻短段合并（避免一句话一段）
  const merged: string[] = [];
  for (const p of paragraphs) {
    const last = merged[merged.length - 1];
    if (last && last.length < 10 && !/[。！？.!?]$/.test(last)) {
      merged[merged.length - 1] = last + p;
    } else {
      merged.push(p);
    }
  }

  const totalLen = merged.reduce((s, p) => s + p.length, 0);
  if (totalLen < 50) return null;

  // 5. 构建干净 HTML
  return merged.map((p) => `<p>${p}</p>`).join("");
}

/* ─── 章节导航 ─── */

function extractNavigationUrls(): { nextUrl: string | null; prevUrl: string | null } {
  let nextUrl: string | null = null;
  let prevUrl: string | null = null;

  const tryGetUrl = (el: Element | null, targetText: string): string | null => {
    if (!el) return null;
    const text = el.textContent?.trim() || "";
    const href = (el as HTMLAnchorElement).href;
    if (text.includes(targetText) && href && href.includes("/chapter/")) return href;
    return null;
  };

  // 新版起点：具体选择器
  const next1 = document.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(2)");
  const prev1 = document.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(1)");
  nextUrl = tryGetUrl(next1, "下一章");
  prevUrl = tryGetUrl(prev1, "上一章");

  // 新版起点：.nav-btn-group a.nav-btn
  if (!nextUrl || !prevUrl) {
    const navBtns = document.querySelectorAll(".nav-btn-group a.nav-btn");
    navBtns.forEach((btn) => {
      const text = btn.textContent?.trim() || "";
      const href = (btn as HTMLAnchorElement).href;
      if (text.includes("下一章") && href && !nextUrl) nextUrl = href;
      else if (text.includes("上一章") && href && !prevUrl) prevUrl = href;
    });
  }

  // 旧版：直接搜索所有 <a>
  if (!nextUrl || !prevUrl) {
    document.querySelectorAll("a").forEach((a) => {
      const text = a.textContent?.trim() || "";
      const href = (a as HTMLAnchorElement).href;
      if (text === "下一章" && href && !nextUrl) nextUrl = href;
      else if (text === "上一章" && href && !prevUrl) prevUrl = href;
    });
  }

  return { nextUrl, prevUrl };
}

interface ContentPayload {
  title: string;
  content: string;
  nextUrl: string | null;
  prevUrl: string | null;
}

function extractFull(): ContentPayload | null {
  const base = extract();
  if (!base) return null;
  const nav = extractNavigationUrls();
  return { ...base, ...nav };
}

/* ─── 浮动按钮 ─── */

function injectButton(): void {
  if (document.getElementById("__nr_btn")) return;

  const btn = document.createElement("div");
  btn.id = "__nr_btn";
  btn.textContent = "📖";
  btn.title = "桌面小窗阅读";

  const css: Record<string, string> = {
    position: "fixed", bottom: "28px", right: "28px",
    width: "50px", height: "50px", borderRadius: "50%",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff", fontSize: "22px", display: "flex",
    alignItems: "center", justifyContent: "center",
    cursor: "pointer", zIndex: "2147483647",
    boxShadow: "0 4px 18px rgba(124,58,237,0.45)",
    transition: "transform .2s, box-shadow .2s",
    userSelect: "none", lineHeight: "1",
  };
  for (const [k, v] of Object.entries(css)) (btn.style as any)[k] = v;

  btn.onmouseenter = () => { btn.style.transform = "scale(1.12)"; };
  btn.onmouseleave = () => { btn.style.transform = "scale(1)"; };

  btn.onclick = async () => {
    btn.textContent = "⏳";
    btn.style.pointerEvents = "none";
    try {
      // Step 1: 提取内容 + 上下章链接
      const data = extractFull();
      if (!data) {
        toast("❌ 未识别到章节内容");
        btn.textContent = "📖";
        btn.style.pointerEvents = "auto";
        return;
      }
      toast(`📋 提取成功: ${data.title} (${data.content.length}字)`);

      // Step 2: 发送到桌面
      console.log("[起点阅读] 开始发送到桌面...", { title: data.title, len: data.content.length });
      const sent = await sendToDesktopApp(data);
      console.log("[起点阅读] sendToDesktopApp 返回:", sent);

      if (sent) {
        toast("✅ 已发送到桌面窗");
      } else {
        toast("⚠️ 桌面程序未连接，回退到页内面板");
        injectReadingPanel(data);
      }
    } catch (err: any) {
      console.error("[起点阅读] 错误:", err);
      toast(`❌ 异常: ${err.message || String(err)}`);
    } finally {
      btn.textContent = "📖";
      btn.style.pointerEvents = "auto";
    }
  };

  document.body.appendChild(btn);
  console.log("[起点阅读] 浮动按钮已注入");
}

/* ─── 桌面程序通信 ─── */

const DESKTOP_URL = "http://127.0.0.1:19876/api/content";

interface DesktopPayload {
  title: string;
  content: string;
  nextUrl?: string | null;
  prevUrl?: string | null;
}

async function sendToDesktopApp(data: DesktopPayload): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    console.log("[起点阅读] fetch POST to", DESKTOP_URL);
    const res = await fetch(DESKTOP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    console.log("[起点阅读] fetch 响应:", res.status, res.statusText);
    return res.ok;
  } catch (err: any) {
    console.error("[起点阅读] fetch 异常:", err.message || String(err));
    return false;
  }
}

/* ─── 浏览器端章节代理抓取 ─── */

const PENDING_URL = "http://127.0.0.1:19876/api/pending-request";

/**
 * 用浏览器 Cookie 抓取章节页面 HTML，解析后发回桌面
 */
async function fetchAndSendChapter(url: string): Promise<void> {
  try {
    console.log("[起点阅读] 代理抓取章节:", url);
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) {
      console.error("[起点阅读] 抓取失败:", resp.status);
      return;
    }
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // 提取标题
    let title = "";
    const titleSelectors = [
      "#reader-content h3", "#reader-content h2", "#reader-content h1",
      ".j_chapterName", "h3.j_chapterName", ".content-wrap h3",
      "h1", "h2", "h3", ".chapter-title", ".text-title",
    ];
    for (const sel of titleSelectors) {
      const el = doc.querySelector(sel);
      if (el?.textContent?.trim()) {
        title = el.textContent.trim();
        break;
      }
    }
    if (!title) title = doc.title || "未命名章节";

    // 提取内容
    let container: Element | null = null;
    const reviewEl = doc.querySelector("#reader-content .enable-review");
    if (reviewEl && (reviewEl.textContent?.trim().length || 0) > 50) {
      container = reviewEl;
    }
    if (!container) {
      const selectors = [
        "#reader-content .enable-review", "#reader-content",
        ".read-content", ".j_readContent", "#chaptercontent",
      ];
      let bestLen = 0;
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        const text = el?.textContent?.trim() || "";
        if (text.length > bestLen) { bestLen = text.length; container = el; }
      }
    }

    if (!container) {
      console.error("[起点阅读] 代理抓取：找不到内容容器");
      return;
    }

    // 复用 cleanAndBuildHtml 逻辑（对 parsed doc）
    const content = cleanParsedHtml(container);
    if (!content) {
      console.error("[起点阅读] 代理抓取：内容为空");
      return;
    }

    // 提取导航链接
    let nextUrl: string | null = null;
    let prevUrl: string | null = null;
    const tryGet = (el: Element | null, t: string): string | null => {
      if (!el) return null;
      const txt = el.textContent?.trim() || "";
      const href = (el as HTMLAnchorElement).href;
      if (txt.includes(t) && href && href.includes("/chapter/")) return href;
      return null;
    };
    nextUrl = tryGet(doc.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(2)"), "下一章");
    prevUrl = tryGet(doc.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(1)"), "上一章");
    if (!nextUrl || !prevUrl) {
      doc.querySelectorAll(".nav-btn-group a.nav-btn").forEach((btn) => {
        const t = btn.textContent?.trim() || "";
        const h = (btn as HTMLAnchorElement).href;
        if (t.includes("下一章") && h && !nextUrl) nextUrl = h;
        else if (t.includes("上一章") && h && !prevUrl) prevUrl = h;
      });
    }

    // 发送到桌面
    await fetch(DESKTOP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, nextUrl, prevUrl }),
    });
    console.log("[起点阅读] 代理抓取完成:", title);
  } catch (err: any) {
    console.error("[起点阅读] 代理抓取异常:", err.message || String(err));
  }
}

/**
 * 对 DOMParser 解析出的元素进行清洗（镜像 cleanAndBuildHtml）
 */
function cleanParsedHtml(rawElement: Element): string | null {
  const clone = rawElement.cloneNode(true) as HTMLElement;
  const NOISE_TAGS = ["style", "script", "svg", "img", "button", "input",
    "canvas", "iframe", "noscript", "video", "audio"];
  for (const tag of NOISE_TAGS) {
    clone.querySelectorAll(tag).forEach((n) => n.remove());
  }
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    if (el.children.length === 0) {
      const text = el.textContent?.trim() || "";
      if (text.length <= 4 && /^\d+$/.test(text)) toRemove.push(el);
    }
  }
  toRemove.forEach((el) => el.remove());

  const pEls = clone.querySelectorAll("p");
  const paragraphs: string[] = [];
  for (const pEl of pEls) {
    const text = pEl.textContent?.replace(/[\s　]+/g, " ").trim() || "";
    if (!text || text.length < 2 || /^\d+$/.test(text)) continue;
    paragraphs.push(text);
  }
  if (paragraphs.length < 3) {
    const rawText = clone.textContent || "";
    const fallback = rawText
      .split(/\n\s*\n|\n{2,}/)
      .map((p) => p.replace(/[\s　]+/g, " ").trim())
      .filter((p) => p.length >= 2 && !/^\d+$/.test(p));
    paragraphs.length = 0;
    paragraphs.push(...fallback);
  }
  if (paragraphs.length === 0) return null;

  const merged: string[] = [];
  for (const p of paragraphs) {
    const last = merged[merged.length - 1];
    if (last && last.length < 10 && !/[。！？.!?]$/.test(last)) {
      merged[merged.length - 1] = last + p;
    } else {
      merged.push(p);
    }
  }
  const totalLen = merged.reduce((s, p) => s + p.length, 0);
  if (totalLen < 50) return null;
  return merged.map((p) => `<p>${p}</p>`).join("");
}

/** 轮询桌面端待请求队列 */
let pollingTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollingTimer) return;
  pollingTimer = setInterval(async () => {
    try {
      const res = await fetch(PENDING_URL);
      if (!res.ok) return;
      const data = await res.json();
      if (data.url) {
        console.log("[起点阅读] 轮询到待请求URL:", data.url);
        await fetchAndSendChapter(data.url);
      }
    } catch {
      // 桌面未启动时静默
    }
  }, 2000);
  console.log("[起点阅读] 轮询已启动");
}

/* ─── 悬浮阅读面板 ─── */

let panelActive = false;

function injectReadingPanel(data: ContentPayload): void {
  // 移除旧面板
  const old = document.getElementById("__nr_panel");
  if (old) old.remove();

  let fontSize = 18;
  let theme: "light" | "dark" | "sepia" = "light";

  // 主题配色
  const themeColors: Record<string, { bg: string; tc: string; btnBg: string }> = {
    light: {
      bg: "rgba(255,255,255,0.72)",
      tc: "#374151",
      btnBg: "rgba(255,255,255,0.6)",
    },
    dark: {
      bg: "rgba(26,26,46,0.82)",
      tc: "#e5e7eb",
      btnBg: "rgba(22,22,42,0.7)",
    },
    sepia: {
      bg: "rgba(244,236,216,0.85)",
      tc: "#5b4636",
      btnBg: "rgba(235,225,200,0.7)",
    },
  };

  // 遮罩
  const overlay = document.createElement("div");
  overlay.id = "__nr_overlay";
  Object.assign(overlay.style, {
    position: "fixed", inset: "0",
    background: "rgba(0,0,0,0.15)",
    zIndex: "2147483646",
    transition: "opacity .25s",
  });

  // 面板容器
  const panel = document.createElement("div");
  panel.id = "__nr_panel";
  Object.assign(panel.style, {
    position: "fixed",
    top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    width: "460px", height: "680px",
    maxWidth: "94vw", maxHeight: "92vh",
    zIndex: "2147483647",
    borderRadius: "16px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
    overflow: "hidden",
    display: "flex", flexDirection: "column",
  });

  // Shadow DOM
  const shadow = panel.attachShadow({ mode: "open" });

  // 样式注入
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .backdrop { position: absolute; inset: 0; -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border-radius: 16px; }
    .container { position: relative; display: flex; flex-direction: column; height: 100%; border-radius: 16px; overflow: hidden; }
    .toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 12px; flex-shrink: 0; cursor: move; user-select: none; }
    .toolbar-title { flex: 1; min-width: 0; font-size: 12px; font-weight: 500; opacity: 0.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar-title.light { color: #374151; }
    .toolbar-title.dark { color: #e5e7eb; }
    .toolbar-title.sepia { color: #5b4636; }
    .btn { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: none; cursor: pointer; font-size: 11px; font-weight: 600; background: transparent; transition: background .15s; }
    .btn:hover { background: rgba(0,0,0,0.08); }
    .btn:disabled { opacity: 0.25; cursor: default; }
    .btn:disabled:hover { background: transparent; }
    .btn-close:hover { background: rgba(239,68,68,0.12); color: #ef4444; }
    .btn-light { color: #374151; }
    .btn-dark { color: #e5e7eb; }
    .btn-sepia { color: #5b4636; }
    .content { flex: 1; overflow-y: auto; padding: 8px 20px 24px; }
    .content.light { color: #374151; }
    .content.dark { color: #e5e7eb; }
    .content.sepia { color: #5b4636; }
    .content-title { text-align: center; font-size: 17px; font-weight: 700; margin-bottom: 20px; }
    .content-body { max-width: 480px; margin: 0 auto; }
    .content-body p { text-indent: 2em; margin-bottom: 0.5em; }
    .content-body p:empty { display: none; }
    .end-marker { text-align: center; padding: 32px 0 8px; opacity: 0.2; font-size: 13px; }
    .content::-webkit-scrollbar { width: 5px; }
    .content::-webkit-scrollbar-track { background: transparent; }
    .content::-webkit-scrollbar-thumb { background: rgba(156,163,175,0.4); border-radius: 3px; }
  `;

  // 构建 DOM
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="backdrop"></div>
    <div class="container">
      <div class="toolbar" id="__nr_drag_handle">
        <button class="btn btn-light" id="__nr_btn_prev" title="上一章（仅桌面窗支持）" disabled>◀</button>
        <span class="toolbar-title light" id="__nr_tb_title">${escapeHtml(data.title)}</span>
        <button class="btn btn-light" id="__nr_btn_font_down" title="缩小字体">A-</button>
        <span class="btn btn-light" id="__nr_font_label" style="width:auto;min-width:24px;cursor:default;font-size:11px;">18</span>
        <button class="btn btn-light" id="__nr_btn_font_up" title="放大字体">A+</button>
        <button class="btn btn-light" id="__nr_btn_theme" title="切换主题">☀️</button>
        <button class="btn btn-light" id="__nr_btn_next" title="下一章（仅桌面窗支持）" disabled>▶</button>
        <button class="btn btn-light btn-close" id="__nr_btn_close" title="关闭 (Esc)">✕</button>
      </div>
      <div class="content light" id="__nr_content">
        <div class="content-title">${escapeHtml(data.title)}</div>
        <div class="content-body">${data.content}</div>
        <div class="end-marker">— END —</div>
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(wrapper);

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  panelActive = true;

  // 引用
  const toolbar = shadow.getElementById("__nr_drag_handle")!;
  const contentEl = shadow.getElementById("__nr_content")!;
  const tbTitle = shadow.getElementById("__nr_tb_title")!;
  const fontLabel = shadow.getElementById("__nr_font_label")!;
  const btnTheme = shadow.getElementById("__nr_btn_theme")!;
  const themeButtons = shadow.querySelectorAll(".btn") as NodeListOf<HTMLElement>;
  const btnPrev = shadow.getElementById("__nr_btn_prev") as HTMLButtonElement;
  const btnNext = shadow.getElementById("__nr_btn_next") as HTMLButtonElement;

  // 导航按钮状态
  btnPrev.disabled = !data.prevUrl;
  btnNext.disabled = !data.nextUrl;

  // 更新主题
  function applyTheme(t: "light" | "dark" | "sepia") {
    const c = themeColors[t];
    panel.style.background = c.bg;
    toolbar.style.background = c.btnBg;
    tbTitle.className = `toolbar-title ${t}`;
    contentEl.className = `content ${t}`;
    themeButtons.forEach(b => {
      b.className = b.className.replace(/btn-light|btn-dark|btn-sepia/g, `btn-${t}`);
    });
    // 更新关闭按钮
    const closeBtn = shadow.getElementById("__nr_btn_close")!;
    closeBtn.className = closeBtn.className.replace(/btn-light|btn-dark|btn-sepia/g, `btn-${t}`);
    btnTheme.textContent = t === "light" ? "☀️" : t === "dark" ? "🌙" : "📜";
  }

  // 主题切换
  btnTheme.addEventListener("click", () => {
    const list: Array<"light" | "dark" | "sepia"> = ["light", "dark", "sepia"];
    theme = list[(list.indexOf(theme) + 1) % 3];
    applyTheme(theme);
  });

  // 字体调节
  shadow.getElementById("__nr_btn_font_down")!.addEventListener("click", () => {
    fontSize = Math.max(14, fontSize - 2);
    contentEl.style.fontSize = `${fontSize}px`;
    fontLabel.textContent = String(fontSize);
  });
  shadow.getElementById("__nr_btn_font_up")!.addEventListener("click", () => {
    fontSize = Math.min(32, fontSize + 2);
    contentEl.style.fontSize = `${fontSize}px`;
    fontLabel.textContent = String(fontSize);
  });
  contentEl.style.fontSize = `${fontSize}px`;
  contentEl.style.lineHeight = "1.85";

  // 关闭
  function closePanel() {
    document.removeEventListener("keydown", onKey);
    overlay.style.opacity = "0";
    panel.style.transition = "opacity .2s";
    panel.style.opacity = "0";
    setTimeout(() => { overlay.remove(); panel.remove(); panelActive = false; }, 220);
  }
  shadow.getElementById("__nr_btn_close")!.addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);

  // Esc 关闭
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && panelActive) closePanel();
  }
  document.addEventListener("keydown", onKey);

  // 拖拽
  let dragging = false, startX = 0, startY = 0, panelX = 0, panelY = 0;
  toolbar.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    panelX = rect.left;
    panelY = rect.top;
    panel.style.transition = "none";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panel.style.transform = "none";
    panel.style.top = `${panelY + dy}px`;
    panel.style.left = `${panelX + dx}px`;
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; panel.style.transition = ""; }
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ─── Toast ─── */

function toast(msg: string): void {
  const old = document.getElementById("__nr_toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = "__nr_toast";
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed", bottom: "92px", right: "28px",
    padding: "8px 16px", background: "rgba(0,0,0,.78)",
    color: "#fff", fontSize: "13px", borderRadius: "8px",
    zIndex: "2147483647", pointerEvents: "none",
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 2000);
}

/* ─── 入口 ─── */

const ENABLE_TEST_ALL = false; // 调试：true = 所有页面都显示按钮

function init(): void {
  console.log("[起点阅读] init, hostname:", window.location.hostname);
  if (ENABLE_TEST_ALL || isNovelSite()) {
    injectButton();
    startPolling();
  }
}

setTimeout(init, 1000);

// DOM 变化监控（SPA 页面）
let t: ReturnType<typeof setTimeout>;
const ob = new MutationObserver(() => {
  clearTimeout(t);
  t = setTimeout(init, 600);
});
setTimeout(() => ob.disconnect(), 60000);
ob.observe(document.body || document.documentElement, { childList: true, subtree: true });
