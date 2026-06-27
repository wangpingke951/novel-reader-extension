/* ─── 阈值 ─── */

export const MIN_CONTENT_LENGTH = 50;
export const MIN_PARAGRAPH_LENGTH = 2;
export const MAX_DIGIT_NODE_LENGTH = 4;
export const MIN_PARAGRAPHS_FOR_P_TAG = 3;
export const SHORT_PARAGRAPH_THRESHOLD = 10;

/* ─── 通信 ─── */

export const DESKTOP_URL = "http://127.0.0.1:19876/api/content";
export const PENDING_URL = "http://127.0.0.1:19876/api/pending-request";
export const HTTP_TIMEOUT_MS = 2000;
export const FAST_POLL_MS = 300;
export const SLOW_POLL_MS = 5000;
export const EMPTY_POLL_THRESHOLD = 30;

/* ─── 延时 ─── */

export const INIT_DELAY_MS = 200;
export const MUTATION_DEBOUNCE_MS = 600;
export const SPA_NAV_DELAY_MS = 300;
export const TOAST_DURATION_MS = 2000;
export const TOAST_FADE_MS = 300;

/* ─── 字体 ─── */

export const FONT_MIN = 14;
export const FONT_MAX = 32;
export const FONT_STEP = 2;

/* ─── UI ─── */

export const PANEL_WIDTH = "460px";
export const PANEL_HEIGHT = "680px";
export const FLOATING_BTN_SIZE = "50px";

/* ─── 正则 ─── */

export const SENTENCE_END_RE = /[。！？.!?]$/;
export const DIGIT_ONLY_RE = /^\d+$/;

/* ─── 选择器 ─── */

export const NOISE_TAGS = [
  "style", "script", "svg", "img", "button", "input",
  "canvas", "iframe", "noscript", "video", "audio",
];

export const TITLE_SELECTORS: readonly string[] = [
  "#reader-content h3",
  "#reader-content h2",
  "#reader-content h1",
  ".j_chapterName", "h3.j_chapterName", ".content-wrap h3",
  "h1", "h2", "h3", ".chapter-title", ".text-title",
];

export const CONTENT_SELECTORS: readonly string[] = [
  "#reader-content .enable-review",
  "#reader-content",
  ".read-content", ".j_readContent", "#chaptercontent",
  ".chapter-content", ".chapter-article", ".reading-content",
  ".noveltext", ".novelbody", ".article-content", "#article",
];

/* ─── 站点检测 ─── */

export const isNovelSite = (): boolean => {
  const h = window.location.hostname;
  return h.includes("qidian.com") || h.includes("jjwxc.net") ||
    h.includes("fanqienovel.com") || h.includes("linovelib.com");
};
