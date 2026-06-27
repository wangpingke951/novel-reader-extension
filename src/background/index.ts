/**
 * 起点阅读 — Background Service Worker
 *
 * 轮询桌面程序待请求队列（/api/pending-request）。
 * 发现待请求 URL 后创建隐藏标签页（proxy tab）让页面 JS 正常渲染，
 * 由 content script 从 live DOM 提取正文并发送到桌面。
 */

import { FAST_POLL_MS, SLOW_POLL_MS, EMPTY_POLL_THRESHOLD, PENDING_URL } from "../lib/constants";

/* ─── 状态 ─── */

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let emptyPolls = 0;

/** 用户主动打开的 content script 端口（tabId → Port），用于保活 */
const activePorts = new Map<number, chrome.runtime.Port>();

/** 代理标签页（tabId → 超时定时器），用于翻章内容抓取 */
const proxyTabs = new Map<number, ReturnType<typeof setTimeout>>();

/* ─── 轮询逻辑 ─── */

function makePollFn(): () => Promise<void> {
  return async () => {
    try {
      const res = await fetch(PENDING_URL);
      if (!res.ok) return;
      const data = await res.json() as { url?: string | null };
      if (data.url) {
        console.log("[起点阅读 SW] 轮询到待请求URL:", data.url);
        emptyPolls = 0;
        resetPolling();

        // 创建隐藏标签页加载章节（页面 JS 正常渲染，正文才能出现在 DOM 中）
        chrome.tabs.create({ url: data.url, active: false }, (tab) => {
          if (!tab.id) return;
          console.log("[起点阅读 SW] 代理标签页已创建, tab:", tab.id);

          // 30 秒超时：若提取失败则关闭标签页
          const timeout = setTimeout(() => {
            console.warn("[起点阅读 SW] 代理标签页超时, tab:", tab.id);
            proxyTabs.delete(tab.id!);
            chrome.tabs.remove(tab.id!).catch(() => {});
          }, 30000);
          proxyTabs.set(tab.id, timeout);
        });
      } else {
        emptyPolls++;
        if (emptyPolls > EMPTY_POLL_THRESHOLD && pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = setInterval(makePollFn(), SLOW_POLL_MS);
          console.log("[起点阅读 SW] 轮询降速为", SLOW_POLL_MS / 1000, "s（空闲）");
        }
      }
    } catch {
      /* 桌面程序未启动时静默 */
    }
  };
}

function resetPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  emptyPolls = 0;
  pollingInterval = setInterval(makePollFn(), FAST_POLL_MS);
}

function startPolling(): void {
  if (pollingInterval) return;
  emptyPolls = 0;
  pollingInterval = setInterval(makePollFn(), FAST_POLL_MS);
  console.log("[起点阅读 SW] 轮询已启动 (" + FAST_POLL_MS + "ms)");
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[起点阅读 SW] 轮询已停止");
  }
}

/* ─── 端口管理 ─── */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "keepAlive") return;
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;

  // ── 代理标签页：发送提取指令 ──
  if (proxyTabs.has(tabId)) {
    console.log("[起点阅读 SW] 代理标签页已连接, tab:", tabId);
    port.postMessage({ type: "PROXY_EXTRACT" });

    port.onMessage.addListener((msg: { type?: string }) => {
      if (msg.type === "PROXY_DONE") {
        console.log("[起点阅读 SW] 代理标签页提取完成, 关闭 tab:", tabId);
        const timeout = proxyTabs.get(tabId);
        if (timeout) clearTimeout(timeout);
        proxyTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }
    });

    port.onDisconnect.addListener(() => {
      const timeout = proxyTabs.get(tabId);
      if (timeout) clearTimeout(timeout);
      proxyTabs.delete(tabId);
    });
    return;
  }

  // ── 普通标签页：保活 + 轮询控制 ──
  console.log("[起点阅读 SW] Content script 已连接, tab:", tabId);
  activePorts.set(tabId, port);

  if (activePorts.size === 1) {
    startPolling();
  }

  port.onDisconnect.addListener(() => {
    console.log("[起点阅读 SW] Content script 已断开, tab:", tabId);
    activePorts.delete(tabId);
    if (activePorts.size === 0) {
      stopPolling();
    }
  });
});

/* ─── 标签页关闭时清理 ─── */

chrome.tabs.onRemoved.addListener((tabId) => {
  activePorts.delete(tabId);
  const timeout = proxyTabs.get(tabId);
  if (timeout) clearTimeout(timeout);
  proxyTabs.delete(tabId);
  if (activePorts.size === 0) {
    stopPolling();
  }
});

/* ─── 安装 ─── */

chrome.runtime.onInstalled.addListener(() => {
  console.log("起点阅读扩展已安装");
});

export {};
