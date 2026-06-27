"""
起点阅读桌面透明窗 — 基于 pywebview + WebView2
接收浏览器扩展发送的章节内容，在桌面透明悬浮窗中显示
"""

import json
import pathlib
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
_pending_lock = threading.Lock()
_pending_request_url = None
_WINDOW_TITLE = "起点阅读"

def get_hwnd():
    """获取窗口句柄（带缓存）"""
    return user32.FindWindowW(None, _WINDOW_TITLE)

def make_transparent():
    """设置窗口为分层窗口以支持透明（带重试）"""
    for _ in range(50):  # 最多重试 5 秒
        hwnd = get_hwnd()
        if hwnd:
            break
        time.sleep(0.1)
    if not hwnd:
        print("[!] 找不到窗口句柄，透明可能不生效")
        return
    print(f"[OK] 找到窗口句柄: {hwnd}")
    ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED | WS_EX_TOPMOST)
    user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)
    print("[OK] 透明 + 置顶已设置")

# ── JS API ──
class ReaderApi:
    def __init__(self):
        self._drag_start_sx = 0
        self._drag_start_sy = 0
        self._win_start_x = 0
        self._win_start_y = 0
        self._hwnd = None

    def _ensure_hwnd(self):
        if not self._hwnd:
            self._hwnd = get_hwnd()
        return self._hwnd

    def close(self):
        if window:
            window.destroy()

    def minimize(self):
        if window:
            window.minimize()

    def toggle_maximize(self):
        if window:
            if window.width > 500:
                window.resize(440, 700)
            else:
                screen_w = user32.GetSystemMetrics(0)
                screen_h = user32.GetSystemMetrics(1)
                window.resize(screen_w, screen_h)
                window.move(0, 0)

    def toggle_fullscreen(self):
        """切换全屏模式"""
        if window:
            window.toggle_fullscreen()

    def start_drag(self, sx, sy):
        """记录拖拽起点（屏幕坐标）"""
        hwnd = self._ensure_hwnd()
        if not hwnd:
            return
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        self._win_start_x = rect.left
        self._win_start_y = rect.top
        self._drag_start_sx = int(sx)
        self._drag_start_sy = int(sy)

    def drag_to(self, sx, sy):
        """移动窗口到新位置（复用缓存的 HWND，不每帧查找）"""
        hwnd = self._hwnd
        if not hwnd:
            return
        dx = int(sx) - self._drag_start_sx
        dy = int(sy) - self._drag_start_sy
        new_x = self._win_start_x + dx
        new_y = self._win_start_y + dy
        user32.SetWindowPos(hwnd, 0, new_x, new_y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)

    def resize(self, width, height):
        if window:
            window.resize(int(width), int(height))

    def request_chapter(self, url):
        """将章节 URL 写入待请求队列，由浏览器 content script 轮询获取"""
        global _pending_request_url
        with _pending_lock:
            _pending_request_url = url
        print(f"[REQUEST] 待请求章节: {url}")

    def debug_ping(self):
        """诊断：确认 JS→Python 通信正常"""
        print("[DEBUG] ping 成功 — JS→Python 通信正常")

# ── HTTP 服务 ──
http_app = Bottle()

@http_app.hook("after_request")
def enable_cors():
    """允许浏览器扩展跨域访问"""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"

@http_app.route("/api/health")
def health():
    response.content_type = "application/json"
    return json.dumps({"status": "ok"})

@http_app.route("/api/pending-request")
def pending_request():
    """浏览器 content script 轮询此端点获取待请求的章节 URL"""
    global _pending_request_url
    response.content_type = "application/json"
    with _pending_lock:
        if _pending_request_url:
            url = _pending_request_url
            _pending_request_url = None
            return json.dumps({"url": url})
    return json.dumps({"url": None})

@http_app.route("/api/content", method=["POST", "OPTIONS"])
def receive_content():
    if request.method == "OPTIONS":
        return ""
    data = request.json
    if not data:
        response.status = 400
        return json.dumps({"error": "no data"})
    title = json.dumps(data.get("title", ""))
    content = json.dumps(data.get("content", ""))
    next_url = json.dumps(data.get("nextUrl") or "")
    prev_url = json.dumps(data.get("prevUrl") or "")
    if window:
        window.evaluate_js(f"updateContent({title}, {content}, {next_url}, {prev_url})")
    else:
        response.status = 503
        return json.dumps({"error": "window not ready"})
    response.content_type = "application/json"
    return json.dumps({"status": "ok"})

def run_server():
    try:
        bottle_run(http_app, host="127.0.0.1", port=19876, quiet=True, debug=False)
    except OSError as e:
        print(f"[FATAL] HTTP 服务启动失败（端口可能被占用）: {e}")
        print("[FATAL] 请检查端口 19876 是否被其他进程占用")

# ── 阅读 UI HTML ──
_UI_DIR = pathlib.Path(__file__).parent
READING_HTML = (_UI_DIR / "reader_ui.html").read_text(encoding="utf-8")

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
        min_size=(300, 350),
        js_api=ReaderApi(),
    )

    # 通过 Win32 API 强制设置分层窗口
    threading.Thread(target=make_transparent, daemon=True).start()

    print("[起点阅读桌面版] 窗口已创建")
    webview.start()
