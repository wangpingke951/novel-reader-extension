import type { PlasmoMessaging } from "@plasmohq/messaging";

let readingWindowId: number | null = null;

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  try {
    // 已有窗口 → 聚焦
    if (readingWindowId !== null) {
      try {
        await chrome.windows.update(readingWindowId, { focused: true });
        return res.send({ success: true });
      } catch {
        readingWindowId = null;
      }
    }

    const url = chrome.runtime.getURL("tabs/reading.html");
    const win = await chrome.windows.create({
      url,
      type: "popup",
      width: 420,
      height: 700,
      focused: true,
    });

    readingWindowId = win.id ?? null;
    res.send({ success: true });
  } catch {
    res.send({ success: false });
  }
};

export default handler;
