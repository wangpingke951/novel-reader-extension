import type { PlasmoCSConfig } from "plasmo";
import { sendToBackground } from "@plasmohq/messaging";

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
      const data = extract();
      if (!data) { toast("❌ 未识别到章节内容"); return; }
      await chrome.storage.local.set({ readerContent: data });
      await sendToBackground({ name: "open-reader" });
      toast("✅ 已在小窗打开");
    } catch {
      toast("❌ 失败，请重试");
    } finally {
      btn.textContent = "📖";
      btn.style.pointerEvents = "auto";
    }
  };

  document.body.appendChild(btn);
  console.log("[起点阅读] 浮动按钮已注入");
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
