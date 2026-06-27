import {
  FLOATING_BTN_SIZE, PANEL_WIDTH, PANEL_HEIGHT,
  FONT_MIN, FONT_MAX, FONT_STEP,
  TOAST_DURATION_MS, TOAST_FADE_MS,
} from "./constants";
import { extractFull, type ContentPayload } from "./extractor";
import { sendToDesktopApp } from "./desktop-client";

/* ─── Toast ─── */

export function toast(msg: string): void {
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
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), TOAST_FADE_MS); }, TOAST_DURATION_MS);
}

/* ─── HTML 转义 ─── */

export function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ─── 浮动按钮 ─── */

export function injectButton(): void {
  if (document.getElementById("__nr_btn")) return;

  const btn = document.createElement("div");
  btn.id = "__nr_btn";
  btn.textContent = "📖";
  btn.title = "桌面小窗阅读";

  const css: Record<string, string> = {
    position: "fixed", bottom: "28px", right: "28px",
    width: FLOATING_BTN_SIZE, height: FLOATING_BTN_SIZE, borderRadius: "50%",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff", fontSize: "22px", display: "flex",
    alignItems: "center", justifyContent: "center",
    cursor: "pointer", zIndex: "2147483647",
    boxShadow: "0 4px 18px rgba(124,58,237,0.45)",
    transition: "transform .2s, box-shadow .2s",
    userSelect: "none", lineHeight: "1",
  };
  Object.assign(btn.style, css);

  btn.onmouseenter = () => { btn.style.transform = "scale(1.12)"; };
  btn.onmouseleave = () => { btn.style.transform = "scale(1)"; };

  btn.onclick = async () => {
    btn.textContent = "⏳";
    btn.style.pointerEvents = "none";
    try {
      const data = extractFull();
      if (!data) {
        toast("❌ 未识别到章节内容");
        return;
      }
      toast(`📋 提取成功: ${data.title} (${data.content.length}字)`);

      console.log("[起点阅读] 开始发送到桌面...", { title: data.title, len: data.content.length });
      const sent = await sendToDesktopApp(data);
      console.log("[起点阅读] sendToDesktopApp 返回:", sent);

      if (sent) {
        toast("✅ 已发送到桌面窗");
      } else {
        toast("⚠️ 桌面程序未连接，回退到页内面板");
        injectReadingPanel(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[起点阅读] 错误:", err);
      toast(`❌ 异常: ${msg}`);
    } finally {
      btn.textContent = "📖";
      btn.style.pointerEvents = "auto";
    }
  };

  document.body.appendChild(btn);
  console.log("[起点阅读] 浮动按钮已注入");
}

/* ─── 悬浮阅读面板 ─── */

let panelActive = false;

export function injectReadingPanel(data: ContentPayload): void {
  const old = document.getElementById("__nr_panel");
  if (old) old.remove();

  let fontSize = 18;
  let theme: "light" | "dark" | "sepia" = "light";

  const themeColors: Record<string, { bg: string; tc: string; btnBg: string }> = {
    light: { bg: "rgba(255,255,255,0.72)", tc: "#374151", btnBg: "rgba(255,255,255,0.6)" },
    dark: { bg: "rgba(26,26,46,0.82)", tc: "#e5e7eb", btnBg: "rgba(22,22,42,0.7)" },
    sepia: { bg: "rgba(244,236,216,0.85)", tc: "#5b4636", btnBg: "rgba(235,225,200,0.7)" },
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
    width: PANEL_WIDTH, height: PANEL_HEIGHT,
    maxWidth: "94vw", maxHeight: "92vh",
    zIndex: "2147483647",
    borderRadius: "16px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
    overflow: "hidden",
    display: "flex", flexDirection: "column",
  });

  // Shadow DOM
  const shadow = panel.attachShadow({ mode: "open" });

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

  const toolbar = shadow.getElementById("__nr_drag_handle")!;
  const contentEl = shadow.getElementById("__nr_content")!;
  const tbTitle = shadow.getElementById("__nr_tb_title")!;
  const fontLabel = shadow.getElementById("__nr_font_label")!;
  const btnTheme = shadow.getElementById("__nr_btn_theme")!;
  const themeButtons = shadow.querySelectorAll(".btn") as NodeListOf<HTMLElement>;
  const btnPrev = shadow.getElementById("__nr_btn_prev") as HTMLButtonElement;
  const btnNext = shadow.getElementById("__nr_btn_next") as HTMLButtonElement;

  btnPrev.disabled = !data.prevUrl;
  btnNext.disabled = !data.nextUrl;

  function applyTheme(t: "light" | "dark" | "sepia") {
    const c = themeColors[t];
    panel.style.background = c.bg;
    toolbar.style.background = c.btnBg;
    tbTitle.className = `toolbar-title ${t}`;
    contentEl.className = `content ${t}`;
    themeButtons.forEach(b => {
      b.className = b.className.replace(/btn-light|btn-dark|btn-sepia/g, `btn-${t}`);
    });
    const closeBtn = shadow.getElementById("__nr_btn_close")!;
    closeBtn.className = closeBtn.className.replace(/btn-light|btn-dark|btn-sepia/g, `btn-${t}`);
    btnTheme.textContent = t === "light" ? "☀️" : t === "dark" ? "🌙" : "📜";
  }

  btnTheme.addEventListener("click", () => {
    const list: Array<"light" | "dark" | "sepia"> = ["light", "dark", "sepia"];
    theme = list[(list.indexOf(theme) + 1) % 3];
    applyTheme(theme);
  });

  shadow.getElementById("__nr_btn_font_down")!.addEventListener("click", () => {
    fontSize = Math.max(FONT_MIN, fontSize - FONT_STEP);
    contentEl.style.fontSize = `${fontSize}px`;
    fontLabel.textContent = String(fontSize);
  });
  shadow.getElementById("__nr_btn_font_up")!.addEventListener("click", () => {
    fontSize = Math.min(FONT_MAX, fontSize + FONT_STEP);
    contentEl.style.fontSize = `${fontSize}px`;
    fontLabel.textContent = String(fontSize);
  });
  contentEl.style.fontSize = `${fontSize}px`;
  contentEl.style.lineHeight = "1.85";

  function closePanel() {
    document.removeEventListener("keydown", onKey);
    overlay.style.opacity = "0";
    panel.style.transition = "opacity .2s";
    panel.style.opacity = "0";
    setTimeout(() => { overlay.remove(); panel.remove(); panelActive = false; }, 220);
  }
  shadow.getElementById("__nr_btn_close")!.addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);

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
