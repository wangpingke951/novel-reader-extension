import { useEffect, useState } from "react";
import "../style.css";

interface Data {
  title: string;
  content: string;
}

type Theme = "light" | "dark" | "sepia";

export default function ReadingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    chrome.storage.local.get("readerContent", (r) => {
      if (r.readerContent) setData(r.readerContent);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const fn = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.readerContent?.newValue) {
        setData(changes.readerContent.newValue);
      }
    };
    chrome.storage.local.onChanged.addListener(fn);
    return () => chrome.storage.local.onChanged.removeListener(fn);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") window.close(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

  const cycleTheme = () => {
    const list: Theme[] = ["light", "dark", "sepia"];
    setTheme(list[(list.indexOf(theme) + 1) % 3]);
  };

  const bg =
    theme === "dark" ? "bg-[#1a1a2e]" : theme === "sepia" ? "bg-[#f4ecd8]" : "bg-transparent";
  const tc =
    theme === "dark" ? "text-gray-200" : theme === "sepia" ? "text-[#5b4636]" : "text-gray-800";

  if (loading) {
    return (
      <div className={`h-screen flex items-center justify-center ${bg}`}>
        <p className={`text-sm ${tc}`}>加载中...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`h-screen flex flex-col items-center justify-center ${bg} gap-3`}>
        <p className="text-4xl">📖</p>
        <p className={`text-sm ${tc}`}>暂无内容</p>
        <p className={`text-xs ${tc}`}>请在起点章节页点击右下角浮动按钮</p>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${bg}`}>
      {/* 工具栏 — 无边框，与内容融为一体 */}
      <div className={`flex items-center gap-2 px-3 py-1.5 flex-shrink-0 ${bg}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate opacity-50 ${tc}`}>{data.title}</p>
        </div>

        <button
          onClick={() => setFontSize((v) => Math.max(14, v - 2))}
          className={`w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 text-xs font-bold ${tc}`}>
          A-
        </button>
        <span className={`text-xs w-5 text-center ${tc}`}>{fontSize}</span>
        <button
          onClick={() => setFontSize((v) => Math.min(32, v + 2))}
          className={`w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 text-xs font-bold ${tc}`}>
          A+
        </button>

        <button
          onClick={cycleTheme}
          className={`w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 text-xs ${tc}`}
          title="切换主题">
          {theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "📜"}
        </button>

        <button
          onClick={() => window.close()}
          className={`w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 hover:text-red-500 text-xs transition-colors ${tc}`}
          title="关闭 (Esc)">
          ✕
        </button>
      </div>

      {/* 内容 — 无分割线 */}
      <div
        className={`flex-1 overflow-y-auto reader-scroll px-5 pb-8 ${tc}`}
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.85 }}>
        <h2 className={`text-lg font-bold mb-6 text-center ${tc} mt-2`}>{data.title}</h2>
        <div
          className="reader-content max-w-xl mx-auto"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
        <div className="text-center py-8 opacity-20">
          <p>— END —</p>
        </div>
      </div>
    </div>
  );
}
