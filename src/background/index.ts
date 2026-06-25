// 清理已关闭的阅读窗口
let readingWindowId: number | null = null;

chrome.windows.onRemoved.addListener((id) => {
  if (id === readingWindowId) readingWindowId = null;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("起点阅读扩展已安装");
});

export {};
