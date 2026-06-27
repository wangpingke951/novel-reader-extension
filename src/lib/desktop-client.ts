import {
  DESKTOP_URL, HTTP_TIMEOUT_MS,
  MIN_CONTENT_LENGTH, CONTENT_SELECTORS,
} from "./constants";
import { extractFromDocument, type ContentPayload } from "./extractor";

export interface DesktopPayload {
  title: string;
  content: string;
  nextUrl?: string | null;
  prevUrl?: string | null;
}

/* ─── 发送到桌面 ─── */

export async function sendToDesktopApp(data: DesktopPayload): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(DESKTOP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[起点阅读] fetch 异常:", msg);
    return false;
  }
}

/* ─── 代理抓取（由 Background SW 通过 content script 端口触发）─── */

async function sendChapterToDesktop(data: ContentPayload): Promise<void> {
  await fetch(DESKTOP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  console.log("[起点阅读] 代理抓取完成:", data.title);
}

export async function fetchAndSendChapter(url: string): Promise<void> {
  console.log("[起点阅读] 代理抓取章节:", url);

  // ── 方案 A：隐藏 iframe（JS 可执行，能获取动态渲染的正文）──
  try {
    const data = await fetchViaIframe(url);
    if (data) {
      await sendChapterToDesktop(data);
      return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[起点阅读] iframe 方案失败:", msg);
  }

  // ── 方案 B：降级为 fetch + DOMParser（旧方案，兼容无 JS 渲染的页面）──
  console.log("[起点阅读] 降级为 fetch 方案");
  try {
    const data = await fetchViaDirect(url);
    if (data) {
      await sendChapterToDesktop(data);
      return;
    }
    console.error("[起点阅读] 代理抓取：找不到内容容器");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[起点阅读] 代理抓取异常:", msg);
  }
}

/* ── iframe 方案：利用页面 JS 渲染正文 ── */

function fetchViaIframe(url: string): Promise<ContentPayload | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "display:none;position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;visibility:hidden;";

    let settled = false;

    function cleanup(result: ContentPayload | null) {
      if (settled) return;
      settled = true;
      if (iframe.parentNode) iframe.remove();
      resolve(result);
    }

    const timeout = setTimeout(() => {
      console.warn("[起点阅读] iframe 加载超时");
      cleanup(null);
    }, 25000);

    iframe.onload = async () => {
      clearTimeout(timeout);
      // 轮询等待 JS 渲染正文（最多 10 秒）
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        console.warn("[起点阅读] iframe 无法访问 document（可能被 X-Frame-Options 阻止）");
        cleanup(null);
        return;
      }

      const found = await waitForContent(doc, 10000);
      if (!found) {
        console.warn("[起点阅读] iframe 中未检测到正文");
        cleanup(null);
        return;
      }

      // 额外等待确保完整渲染
      await sleep(500);

      const data = extractFromDocument(doc);
      console.log("[起点阅读] iframe 方案成功:", data?.title);
      cleanup(data);
    };

    iframe.onerror = () => {
      clearTimeout(timeout);
      console.warn("[起点阅读] iframe 加载错误");
      cleanup(null);
    };

    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

async function waitForContent(doc: Document, maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const reviewEl = doc.querySelector("#reader-content .enable-review");
    if (reviewEl && (reviewEl.textContent?.trim().length ?? 0) > MIN_CONTENT_LENGTH) {
      return true;
    }
    for (const sel of CONTENT_SELECTORS) {
      const el = doc.querySelector(sel);
      if (el && (el.textContent?.trim().length ?? 0) > MIN_CONTENT_LENGTH) {
        return true;
      }
    }
    await sleep(500);
  }
  return false;
}

/* ─── fetch 降级方案：直接 HTTP 请求 + DOMParser ─── */

async function fetchViaDirect(url: string): Promise<ContentPayload | null> {
  const resp = await fetch(url, { credentials: "include" });
  if (!resp.ok) {
    console.error("[起点阅读] 抓取失败:", resp.status);
    return null;
  }
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return extractFromDocument(doc);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
