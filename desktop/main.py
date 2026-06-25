"""
起点阅读桌面透明窗 — 基于 pywebview + WebView2
接收浏览器扩展发送的章节内容，在桌面透明悬浮窗中显示
"""

import json
import threading
import time
import ctypes
from ctypes import wintypes
import webview
from bottle import Bottle, request, response, run as bottle_run

# ── Win32 常量 ──
WS_EX_LAYERED = 0x00080000
WS_EX_TOPMOST = 0x00000008
GWL_EXSTYLE = -20
HWND_TOPMOST = -1
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_NOZORDER = 0x0004

user32 = ctypes.windll.user32

# ── 全局状态 ──
window = None

def make_transparent():
    """设置窗口为分层窗口以支持透明"""
    time.sleep(0.8)
    hwnd = user32.FindWindowW(None, "起点阅读")
    if not hwnd:
        print("[!] 找不到窗口句柄，透明可能不生效")
        return
    print(f"[OK] 找到窗口句柄: {hwnd}")
    ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED | WS_EX_TOPMOST)
    # 确保置顶
    user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)
    print("[OK] 透明 + 置顶已设置")

# ── JS API ──
class ReaderApi:
    def __init__(self):
        self._drag_start_sx = 0
        self._drag_start_sy = 0
        self._win_start_x = 0
        self._win_start_y = 0

    def close(self):
        if window:
            window.destroy()

    def start_drag(self, sx, sy):
        """记录拖拽起点（屏幕坐标）"""
        hwnd = user32.FindWindowW(None, "起点阅读")
        if not hwnd:
            print("[DRAG] ❌ 找不到窗口句柄")
            return
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        self._win_start_x = rect.left
        self._win_start_y = rect.top
        self._drag_start_sx = int(sx)
        self._drag_start_sy = int(sy)
        print(f"[DRAG] 起点: win=({self._win_start_x},{self._win_start_y}) mouse=({self._drag_start_sx},{self._drag_start_sy})")

    def drag_to(self, sx, sy):
        """移动窗口到新位置"""
        hwnd = user32.FindWindowW(None, "起点阅读")
        if not hwnd:
            return
        dx = int(sx) - self._drag_start_sx
        dy = int(sy) - self._drag_start_sy
        new_x = self._win_start_x + dx
        new_y = self._win_start_y + dy
        # SWP_NOZORDER: 不改变 Z 序；SWP_NOSIZE: 不改变尺寸；SWP_NOACTIVATE: 不激活
        user32.SetWindowPos(hwnd, 0, new_x, new_y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)

    def debug_ping(self):
        """诊断：确认 JS→Python 通信正常"""
        print("[DEBUG] ping 成功 — JS→Python 通信正常")

# ── HTTP 服务 ──
http_app = Bottle()

@http_app.route("/api/health")
def health():
    response.content_type = "application/json"
    return json.dumps({"status": "ok"})

@http_app.route("/api/content", method="POST")
def receive_content():
    data = request.json
    if not data:
        response.status = 400
        return json.dumps({"error": "no data"})
    title = json.dumps(data.get("title", ""))
    content = json.dumps(data.get("content", ""))
    if window:
        window.evaluate_js(f"updateContent({title}, {content})")
    response.content_type = "application/json"
    return json.dumps({"status": "ok"})

def run_server():
    bottle_run(http_app, host="127.0.0.1", port=19876, quiet=True, debug=False)

# ── 阅读 UI HTML ──
READING_HTML = r"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  :root { --bg: rgba(30,30,30,0.75); --tc: #e0e0e0; --btn-bg: rgba(20,20,30,0.55); --font: 18px; }
  :root.light  { --bg: rgba(255,255,255,0.70); --tc: #374151; --btn-bg: rgba(255,255,255,0.50); }
  :root.dark   { --bg: rgba(26,26,46,0.78);  --tc: #e5e7eb; --btn-bg: rgba(22,22,42,0.55); }
  :root.sepia  { --bg: rgba(244,236,216,0.82); --tc: #5b4636; --btn-bg: rgba(235,225,200,0.55); }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; background: transparent !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif; }

  .wrapper { display: flex; flex-direction: column; height: 100%; border-radius: 12px; overflow: hidden; background: var(--bg); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); transition: background .3s; }

  .toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 12px; flex-shrink: 0; cursor: default; user-select: none; background: var(--btn-bg); transition: background .3s; }
  .toolbar-title { flex: 1; min-width: 0; font-size: 11px; font-weight: 500; opacity: 0.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tc); }
  .tb-btn { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: none; cursor: pointer; font-size: 11px; font-weight: 600; background: transparent; color: var(--tc); transition: background .15s; }
  .tb-btn:hover { background: rgba(128,128,128,0.15); }
  .tb-btn.close:hover { background: rgba(239,68,68,0.2); color: #ef4444; }
  .tb-label { font-size: 10px; min-width: 20px; text-align: center; color: var(--tc); }

  .content { flex: 1; overflow-y: auto; padding: 10px 22px 28px; font-size: var(--font); line-height: 1.9; color: var(--tc); transition: color .3s; }
  .content-title { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 22px; color: var(--tc); }
  .content-body { max-width: 460px; margin: 0 auto; }
  .content-body p { text-indent: 2em; margin-bottom: 0.5em; }
  .content-body p:empty { display: none; }
  .end-marker { text-align: center; padding: 36px 0 12px; opacity: 0.18; font-size: 12px; }

  .content::-webkit-scrollbar { width: 5px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { background: rgba(156,163,175,0.35); border-radius: 3px; }

  .empty-state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; pointer-events: none; }
  .empty-state .icon { font-size: 40px; }
  .empty-state .text { font-size: 13px; opacity: 0.35; color: var(--tc); }
</style>
</head>
<body>

<div class="wrapper">
  <div class="toolbar" id="toolbar">
    <span class="toolbar-title" id="tbTitle">起点阅读 — 等待内容</span>
    <button class="tb-btn" id="btnFontDown" title="缩小字体">A-</button>
    <span class="tb-label" id="fontLabel">18</span>
    <button class="tb-btn" id="btnFontUp" title="放大字体">A+</button>
    <button class="tb-btn" id="btnTheme" title="切换主题">☀️</button>
    <button class="tb-btn close" id="btnClose" title="关闭">✕</button>
  </div>

  <div class="content" id="contentEl">
    <div class="empty-state" id="emptyState">
      <span class="icon">📖</span>
      <span class="text">等待章节内容...</span>
      <span class="text" style="font-size:11px">请在起点章节页点击右下角浮动按钮</span>
    </div>
    <div class="content-title" id="contentTitle" style="display:none"></div>
    <div class="content-body" id="contentBody"></div>
    <div class="end-marker" id="endMarker" style="display:none">— END —</div>
  </div>
</div>

<script>
  let fontSize = 18;
  let theme = "dark";

  function applyTheme(t) {
    theme = t;
    document.documentElement.className = t;
    document.getElementById("btnTheme").textContent = t === "light" ? "☀️" : t === "dark" ? "🌙" : "📜";
  }

  function updateContent(title, content) {
    document.getElementById("emptyState").style.display = "none";
    var tEl = document.getElementById("contentTitle");
    tEl.style.display = "block";
    tEl.textContent = title;
    document.getElementById("contentBody").innerHTML = content;
    document.getElementById("endMarker").style.display = "block";
    document.getElementById("tbTitle").textContent = title;
  }

  // ── 按钮 ──
  document.getElementById("btnFontDown").addEventListener("click", function(){
    fontSize = Math.max(14, fontSize - 2);
    document.getElementById("contentEl").style.setProperty("--font", fontSize + "px");
    document.getElementById("fontLabel").textContent = fontSize;
  });
  document.getElementById("btnFontUp").addEventListener("click", function(){
    fontSize = Math.min(32, fontSize + 2);
    document.getElementById("contentEl").style.setProperty("--font", fontSize + "px");
    document.getElementById("fontLabel").textContent = fontSize;
  });
  document.getElementById("btnTheme").addEventListener("click", function(){
    var list = ["light","dark","sepia"];
    applyTheme(list[(list.indexOf(theme) + 1) % 3]);
  });
  document.getElementById("btnClose").addEventListener("click", function(){
    window.pywebview.api.close();
  });

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") window.pywebview.api.close();
  });

  // ── 诊断信息 ──
  var debugEl = document.createElement("div");
  debugEl.style.cssText = "position:fixed;bottom:8px;left:12px;font-size:10px;opacity:0.5;color:var(--tc);pointer-events:none;z-index:9999;max-width:420px;line-height:1.4";
  document.body.appendChild(debugEl);

  function dlog(msg) {
    console.log("[READER]", msg);
    debugEl.textContent = "[诊断] " + msg;
    setTimeout(function(){ if (debugEl.textContent === "[诊断] " + msg) debugEl.textContent = ""; }, 3000);
  }

  // 检查 pywebview API 是否可用
  dlog("pywebview=" + (typeof window.pywebview) + " api=" + (typeof (window.pywebview && window.pywebview.api)));

  // ── 拖拽：JS 跟踪屏幕坐标 → Python SetWindowPos ──
  (function(){
    var toolbar = document.getElementById("toolbar");
    var dragging = false;

    toolbar.addEventListener("mousedown", function(e){
      if (e.target.tagName === "BUTTON") return;
      dragging = true;
      dlog("drag start @ " + e.screenX + "," + e.screenY);
      try {
        window.pywebview.api.start_drag(e.screenX, e.screenY);
      } catch(err) {
        dlog("❌ start_drag 失败: " + err.message);
      }
      e.preventDefault();
    });

    document.addEventListener("mousemove", function(e){
      if (!dragging) return;
      try {
        window.pywebview.api.drag_to(e.screenX, e.screenY);
      } catch(err) { /* 静默，避免拖拽时日志刷屏 */ }
    });

    document.addEventListener("mouseup", function(){
      if (dragging) {
        dragging = false;
        dlog("drag end");
      }
    });
  })();
</script>
</body>
</html>
"""

# ── 入口 ──
if __name__ == "__main__":
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    print("[起点阅读桌面版] HTTP 服务已启动: http://127.0.0.1:19876")

    window = webview.create_window(
        title="起点阅读",
        html=READING_HTML,
        width=440,
        height=700,
        x=200,
        y=80,
        frameless=True,
        transparent=True,
        on_top=True,
        easy_drag=False,
        js_api=ReaderApi(),
    )

    # 通过 Win32 API 强制设置分层窗口
    threading.Thread(target=make_transparent, daemon=True).start()

    print("[起点阅读桌面版] 窗口已创建")
    webview.start()
