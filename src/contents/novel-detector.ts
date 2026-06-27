import type { PlasmoCSConfig } from "plasmo";

import { isNovelSite, INIT_DELAY_MS, MUTATION_DEBOUNCE_MS, SPA_NAV_DELAY_MS, MIN_CONTENT_LENGTH } from "../lib/constants";
import { fetchAndSendChapter, sendToDesktopApp } from "../lib/desktop-client";
import { extractFull } from "../lib/extractor";
import { injectButton } from "../lib/ui";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
};

/* ─── 入口 ─── */

const ENABLE_TEST_ALL = false; // 调试：true = 所有页面都显示按钮

let port: chrome.runtime.Port | null = null;
let isProxyTab = false;

function connectToBackground(): void {
  if (port) {
    port.disconnect();
    port = null;
  }

  const newPort = chrome.runtime.connect({ name: "keepAlive" });
  port = newPort;

  newPort.onMessage.addListener((msg: { type: string; url?: string }) => {
    if (msg.type === "DO_FETCH" && msg.url) {
      console.log("[起点阅读] 收到代理抓取请求:", msg.url);
      fetchAndSendChapter(msg.url);
    }
    if (msg.type === "PROXY_EXTRACT") {
      isProxyTab = true;
      console.log("[起点阅读] 代理标签页：从 live DOM 提取正文");
      handleProxyExtract(newPort);
    }
  });

  newPort.onDisconnect.addListener(() => {
    if (port === newPort) {
      port = null;
      // 代理标签页不需要重连（会被 SW 关闭）
      if (!isProxyTab && (isNovelSite() || ENABLE_TEST_ALL)) {
        console.log("[起点阅读] 端口断开，5s 后重连");
        setTimeout(connectToBackground, 5000);
      }
    }
  });
}

/* ─── 代理标签页：从 live DOM 提取正文 ─── */

async function handleProxyExtract(port: chrome.runtime.Port): Promise<void> {
  try {
    // 等待页面 JS 渲染正文（最多 15 秒）
    const found = await waitForContentOnPage(15000);
    if (!found) {
      console.error("[起点阅读] 代理标签页：等待正文超时");
      port.postMessage({ type: "PROXY_DONE" });
      return;
    }

    // 额外等待确保完整渲染
    await sleep(800);

    const data = extractFull();
    if (!data) {
      console.error("[起点阅读] 代理标签页：提取失败（找不到内容容器）");
      port.postMessage({ type: "PROXY_DONE" });
      return;
    }

    await sendToDesktopApp(data);
    console.log("[起点阅读] 代理标签页提取完成:", data.title);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[起点阅读] 代理标签页异常:", msg);
  } finally {
    port.postMessage({ type: "PROXY_DONE" });
  }
}

async function waitForContentOnPage(maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const reviewEl = document.querySelector("#reader-content .enable-review");
    if (reviewEl && (reviewEl.textContent?.trim().length ?? 0) > MIN_CONTENT_LENGTH) {
      return true;
    }
    // 也检查 body 文本长度（兜底）
    const bodyText = document.body?.textContent?.trim() || "";
    if (bodyText.length > MIN_CONTENT_LENGTH * 4) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── 普通标签页初始化 ─── */

function init(): void {
  console.log("[起点阅读] init, hostname:", window.location.hostname);
  if (ENABLE_TEST_ALL || isNovelSite()) {
    injectButton();
    connectToBackground();
  }
}

setTimeout(init, INIT_DELAY_MS);

// SPA 导航支持（MutationObserver + pushState/replaceState 拦截 + popstate）
let t: ReturnType<typeof setTimeout>;
const ob = new MutationObserver(() => {
  clearTimeout(t);
  t = setTimeout(init, MUTATION_DEBOUNCE_MS);
});
ob.observe(document.body || document.documentElement, { childList: true, subtree: true });

const _pushState = history.pushState.bind(history);
history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
  _pushState(data, unused, url);
  setTimeout(init, SPA_NAV_DELAY_MS);
};
const _replaceState = history.replaceState.bind(history);
history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
  _replaceState(data, unused, url);
  setTimeout(init, SPA_NAV_DELAY_MS);
};

window.addEventListener("popstate", () => setTimeout(init, SPA_NAV_DELAY_MS));
