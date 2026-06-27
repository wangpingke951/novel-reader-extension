import {
  TITLE_SELECTORS, CONTENT_SELECTORS, NOISE_TAGS,
  MIN_CONTENT_LENGTH, MIN_PARAGRAPH_LENGTH, MAX_DIGIT_NODE_LENGTH,
  MIN_PARAGRAPHS_FOR_P_TAG, SHORT_PARAGRAPH_THRESHOLD,
  DIGIT_ONLY_RE, SENTENCE_END_RE,
} from "./constants";

export interface ContentPayload {
  title: string;
  content: string;
  nextUrl: string | null;
  prevUrl: string | null;
}

/* ─── 正文提取 ─── */

export function extract(): { title: string; content: string } | null {
  let title = "";
  for (const sel of TITLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) {
      title = el.textContent.trim();
      break;
    }
  }
  if (!title) title = document.title || "未命名章节";

  let container: Element | null = null;

  const reviewEl = document.querySelector("#reader-content .enable-review");
  if (reviewEl && (reviewEl.textContent?.trim().length ?? 0) > MIN_CONTENT_LENGTH) {
    container = reviewEl;
  }

  if (!container) {
    let bestLen = 0;
    for (const sel of CONTENT_SELECTORS) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || "";
      if (text.length > bestLen) {
        bestLen = text.length;
        container = el;
      }
    }
  }

  if (!container) return null;

  const content = cleanAndBuildHtml(container);
  if (!content) return null;

  return { title, content };
}

/**
 * 清洗 DOM：移除噪音元素，提取正文段落，重建干净 HTML
 * 对 live DOM 元素和 DOMParser 解析后的元素均适用
 */
export function cleanAndBuildHtml(rawElement: Element): string | null {
  const clone = rawElement.cloneNode(true) as HTMLElement;

  for (const tag of NOISE_TAGS) {
    clone.querySelectorAll(tag).forEach((n) => n.remove());
  }

  const doc = clone.ownerDocument || document;
  const walker = doc.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    if (el.children.length === 0) {
      const text = el.textContent?.trim() || "";
      if (text.length <= MAX_DIGIT_NODE_LENGTH && DIGIT_ONLY_RE.test(text)) {
        toRemove.push(el);
      }
    }
  }
  toRemove.forEach((el) => el.remove());

  const pEls = clone.querySelectorAll("p");
  const paragraphs: string[] = [];

  for (const pEl of pEls) {
    const text = pEl.textContent?.replace(/[\s　]+/g, " ").trim() || "";
    if (!text || text.length < MIN_PARAGRAPH_LENGTH || DIGIT_ONLY_RE.test(text)) continue;
    paragraphs.push(text);
  }

  if (paragraphs.length < MIN_PARAGRAPHS_FOR_P_TAG) {
    const rawText = clone.textContent || "";
    const fallback = rawText
      .split(/\n\s*\n|\n{2,}/)
      .map((p) => p.replace(/[\s　]+/g, " ").trim())
      .filter((p) => p.length >= MIN_PARAGRAPH_LENGTH && !DIGIT_ONLY_RE.test(p));
    paragraphs.length = 0;
    paragraphs.push(...fallback);
  }

  if (paragraphs.length === 0) return null;

  const merged: string[] = [];
  for (const p of paragraphs) {
    const last = merged[merged.length - 1];
    if (last && last.length < SHORT_PARAGRAPH_THRESHOLD && !SENTENCE_END_RE.test(last)) {
      merged[merged.length - 1] = last + p;
    } else {
      merged.push(p);
    }
  }

  const totalLen = merged.reduce((s, p) => s + p.length, 0);
  if (totalLen < MIN_CONTENT_LENGTH) return null;

  return merged.map((p) => `<p>${p}</p>`).join("");
}

/* ─── 章节导航 ─── */

export function extractNavigationUrls(root: Document | Element = document): {
  nextUrl: string | null;
  prevUrl: string | null;
} {
  let nextUrl: string | null = null;
  let prevUrl: string | null = null;

  const tryGetUrl = (el: Element | null, targetText: string): string | null => {
    if (!el) return null;
    const text = el.textContent?.trim() || "";
    const href = (el as HTMLAnchorElement).href;
    if (text.includes(targetText) && href && href.includes("/chapter/")) return href;
    return null;
  };

  const prev1 = root.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(1)");
  prevUrl = tryGetUrl(prev1, "上一章");
  // 下一章可能是 nth-child(2) 或 nth-child(3)（取决于是否有目录链接）
  const next2 = root.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(2)");
  const next3 = root.querySelector("#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(3)");
  nextUrl = tryGetUrl(next2, "下一章") || tryGetUrl(next3, "下一章");

  if (!nextUrl || !prevUrl) {
    const navBtns = root.querySelectorAll(".nav-btn-group a.nav-btn");
    navBtns.forEach((btn) => {
      const text = btn.textContent?.trim() || "";
      const href = (btn as HTMLAnchorElement).href;
      if (text.includes("下一章") && href && !nextUrl) nextUrl = href;
      else if (text.includes("上一章") && href && !prevUrl) prevUrl = href;
    });
  }

  if (!nextUrl || !prevUrl) {
    root.querySelectorAll("a").forEach((a) => {
      const text = a.textContent?.trim() || "";
      const href = (a as HTMLAnchorElement).href;
      if (text === "下一章" && href && !nextUrl) nextUrl = href;
      else if (text === "上一章" && href && !prevUrl) prevUrl = href;
    });
  }

  return { nextUrl, prevUrl };
}

export function extractFull(): ContentPayload | null {
  const base = extract();
  if (!base) return null;
  const nav = extractNavigationUrls();
  return { ...base, ...nav };
}

/**
 * 从任意 Document 中提取章节内容（live DOM / iframe document / DOMParser 结果均适用）
 * 用于代理抓取翻章场景
 */
export function extractFromDocument(doc: Document): ContentPayload | null {
  let title = "";
  for (const sel of TITLE_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el?.textContent?.trim()) {
      title = el.textContent.trim();
      break;
    }
  }
  if (!title) title = doc.title || "未命名章节";

  let container: Element | null = null;

  const reviewEl = doc.querySelector("#reader-content .enable-review");
  if (reviewEl && (reviewEl.textContent?.trim().length ?? 0) > MIN_CONTENT_LENGTH) {
    container = reviewEl;
  }

  if (!container) {
    let bestLen = 0;
    for (const sel of CONTENT_SELECTORS) {
      const el = doc.querySelector(sel);
      const text = el?.textContent?.trim() || "";
      if (text.length > bestLen) {
        bestLen = text.length;
        container = el;
      }
    }
  }

  if (!container) return null;

  const content = cleanAndBuildHtml(container);
  if (!content) return null;

  const { nextUrl, prevUrl } = extractNavigationUrls(doc);

  return { title, content, nextUrl, prevUrl };
}
