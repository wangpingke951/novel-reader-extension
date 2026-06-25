"""
ChapterFetcher — HTTP 获取起点章节页面，解析标题/正文/上下章链接
镜像 content script 的 DOM 提取逻辑
"""

import re
import copy
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag


class ChapterFetcherError(Exception):
    pass


class ChapterFetcher:
    BASE_URL = "https://www.qidian.com"

    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    CONTENT_SELECTORS = [
        "#reader-content .enable-review",
        "#reader-content",
        ".read-content", ".j_readContent", "#chaptercontent",
        ".chapter-content", ".chapter-article", ".reading-content",
        ".noveltext", ".novelbody", ".article-content", "#article",
    ]

    TITLE_SELECTORS = [
        "#reader-content h3", "#reader-content h2", "#reader-content h1",
        ".j_chapterName", "h3.j_chapterName", ".content-wrap h3",
        "h1", "h2", "h3", ".chapter-title", ".text-title",
    ]

    NOISE_TAGS = [
        "style", "script", "svg", "img", "button", "input",
        "canvas", "iframe", "noscript", "video", "audio",
    ]

    def fetch(self, url: str) -> dict:
        """获取章节页面并解析。成功返回 {title, content, nextUrl, prevUrl, url}，失败返回 {error}"""
        try:
            resp = requests.get(url, headers=self.HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            return {"error": f"网络请求失败: {str(e)}"}

        soup = BeautifulSoup(resp.text, "html.parser")

        title = self._parse_title(soup)
        if not title:
            return {"error": "无法解析章节标题，请确认该章节可访问"}

        content = self._parse_content(soup)
        if not content:
            return {"error": "无法解析章节内容，可能是VIP章节，请在浏览器中打开"}

        next_url = self._parse_nav_url(soup, "下一章", url)
        prev_url = self._parse_nav_url(soup, "上一章", url)

        return {
            "title": title,
            "content": content,
            "nextUrl": next_url,
            "prevUrl": prev_url,
            "url": url,
        }

    def _parse_title(self, soup: BeautifulSoup) -> Optional[str]:
        for sel in self.TITLE_SELECTORS:
            el = soup.select_one(sel)
            if el and (text := el.get_text(strip=True)):
                return text
        title_tag = soup.find("title")
        return title_tag.get_text(strip=True) if title_tag else None

    def _parse_content(self, soup: BeautifulSoup) -> Optional[str]:
        # 优先使用 .enable-review
        container: Optional[Tag] = None
        for sel in ["#reader-content .enable-review", "#reader-content"]:
            el = soup.select_one(sel)
            if el and len(el.get_text(strip=True)) > 50:
                container = el
                break

        # 回退遍历
        if not container:
            best_len = 0
            for sel in self.CONTENT_SELECTORS:
                el = soup.select_one(sel)
                if el and (text_len := len(el.get_text(strip=True))) > best_len:
                    best_len = text_len
                    container = el

        if not container:
            return None

        # 清洗 DOM
        clone = copy.copy(container)
        for tag_name in self.NOISE_TAGS:
            for tag in clone.find_all(tag_name):
                tag.decompose()

        # 提取 <p> 段落
        paragraphs: list[str] = []
        for p_tag in clone.find_all("p"):
            text = re.sub(r"[\s　]+", "", p_tag.get_text(strip=True))
            if not text or len(text) < 2 or re.match(r"^\d+$", text):
                continue
            paragraphs.append(text)

        # <p> 太少则回退到文本拆段
        if len(paragraphs) < 3:
            raw = clone.get_text()
            lines = [l.strip() for l in re.split(r"\n\s*\n", raw) if l.strip()]
            paragraphs = [
                re.sub(r"[\s　]+", "", l)
                for l in lines
                if len(l) >= 2 and not re.match(r"^\d+$", l)
            ]

        if not paragraphs:
            return None

        # 合并短段
        merged: list[str] = []
        for p in paragraphs:
            if merged and len(merged[-1]) < 10 and not re.search(r"[。！？.!?]$", merged[-1]):
                merged[-1] = merged[-1] + p
            else:
                merged.append(p)

        total_len = sum(len(p) for p in merged)
        if total_len < 50:
            return None

        return "".join(f"<p>{p}</p>" for p in merged)

    def _parse_nav_url(self, soup: BeautifulSoup, link_text: str,
                       current_url: str) -> Optional[str]:
        # 新版：.nav-btn-group a.nav-btn
        nav_group = soup.select_one(".nav-btn-group")
        if nav_group:
            for a in nav_group.select("a.nav-btn"):
                if link_text in (a.get_text(strip=True) or ""):
                    href = a.get("href", "")
                    if href:
                        return urljoin(current_url or self.BASE_URL, href)

        # 回退：扫描所有 <a>
        for a in soup.find_all("a"):
            if link_text in (a.get_text(strip=True) or ""):
                href = a.get("href", "")
                if href:
                    return urljoin(current_url or self.BASE_URL, href)

        return None
