#!/usr/bin/env python3
"""
Download all "file" resources linked from a website.

This tool starts from a URL, optionally crawls same-site HTML pages up to a depth,
and downloads linked non-HTML resources (and common file extensions) to disk.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import ParseResult, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup


DEFAULT_FILE_EXTENSIONS = {
    # archives
    ".zip",
    ".tar",
    ".gz",
    ".tgz",
    ".bz2",
    ".7z",
    ".rar",
    # documents
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".csv",
    ".txt",
    ".rtf",
    ".epub",
    # images
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".bmp",
    ".tiff",
    # audio/video
    ".mp3",
    ".wav",
    ".flac",
    ".ogg",
    ".mp4",
    ".m4v",
    ".mov",
    ".mkv",
    ".webm",
    ".avi",
    # web assets / binaries
    ".css",
    ".js",
    ".map",
    ".wasm",
    ".exe",
    ".msi",
    ".dmg",
    ".pkg",
    ".deb",
    ".rpm",
}


def _normalize_url(url: str) -> str:
    """
    Normalize a URL for de-duplication:
    - remove fragment
    - strip trailing whitespace
    """
    url = url.strip()
    parsed = urlparse(url)
    parsed = parsed._replace(fragment="")
    return urlunparse(parsed)


def _is_http_url(url: str) -> bool:
    scheme = urlparse(url).scheme.lower()
    return scheme in {"http", "https"}


def _same_host(a: ParseResult, b: ParseResult) -> bool:
    return (a.hostname or "").lower() == (b.hostname or "").lower()


def _looks_like_file_by_extension(url: str, file_exts: set[str]) -> bool:
    path = urlparse(url).path
    _, ext = os.path.splitext(path.lower())
    return ext in file_exts


def _is_probably_html_content_type(content_type: str | None) -> bool:
    if not content_type:
        return False
    ct = content_type.split(";", 1)[0].strip().lower()
    return ct in {"text/html", "application/xhtml+xml"}


def _safe_filename(name: str) -> str:
    # Keep it simple and portable.
    name = name.strip()
    name = re.sub(r"[^\w\-.]+", "_", name)
    name = name.strip("._")
    return name or "download"


def _short_hash(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:10]


def _output_path_for_url(output_dir: Path, url: str, content_type: str | None = None) -> Path:
    """
    Map URL -> output path (mirrors host + path).
    Adds a short hash when query string is present.
    """
    parsed = urlparse(url)
    host = parsed.hostname or "unknown-host"
    path = parsed.path or "/"

    # If it ends with / or has no basename, pick a name.
    basename = os.path.basename(path.rstrip("/"))
    if not basename:
        basename = "index"
        if content_type:
            ct = content_type.split(";", 1)[0].strip().lower()
            if ct == "text/html":
                basename += ".html"
        if not os.path.splitext(basename)[1]:
            basename += ".bin"

    basename = _safe_filename(basename)

    # Build directory structure.
    parent = os.path.dirname(path.lstrip("/"))
    out_dir = output_dir / host / parent

    # Preserve extension if present; otherwise try to infer a reasonable one.
    stem, ext = os.path.splitext(basename)
    if not ext and content_type:
        ct = content_type.split(";", 1)[0].strip().lower()
        if ct == "application/pdf":
            ext = ".pdf"
        elif ct.startswith("image/"):
            ext = "." + ct.split("/", 1)[1]
        elif ct.startswith("text/"):
            ext = ".txt"
        elif ct == "text/html":
            ext = ".html"

    if parsed.query:
        stem = f"{stem}_{_short_hash(parsed.query)}"

    filename = _safe_filename(stem) + (ext or "")
    return out_dir / filename


def _extract_links(base_url: str, html: str) -> set[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: set[str] = set()

    # Common places where resources are linked from.
    for tag, attr in (
        ("a", "href"),
        ("link", "href"),
        ("img", "src"),
        ("script", "src"),
        ("source", "src"),
        ("video", "src"),
        ("audio", "src"),
    ):
        for el in soup.find_all(tag):
            val = el.get(attr)
            if not val:
                continue
            val = val.strip()
            if not val:
                continue
            # Skip non-fetchable pseudo-links.
            if val.startswith(("mailto:", "tel:", "javascript:", "data:")):
                continue
            abs_url = urljoin(base_url, val)
            abs_url = _normalize_url(abs_url)
            if _is_http_url(abs_url):
                links.add(abs_url)

    return links


@dataclass(frozen=True)
class DownloadResult:
    url: str
    path: Path
    bytes_written: int
    status_code: int


class SiteDownloader:
    def __init__(
        self,
        start_url: str,
        output_dir: Path,
        *,
        max_depth: int,
        same_domain_only: bool,
        max_pages: int,
        max_files: int,
        timeout_s: float,
        sleep_s: float,
        retries: int,
        file_extensions: set[str],
        detect_files_by_content_type: bool,
        user_agent: str,
    ) -> None:
        self.start_url = _normalize_url(start_url)
        self.output_dir = output_dir
        self.max_depth = max_depth
        self.same_domain_only = same_domain_only
        self.max_pages = max_pages
        self.max_files = max_files
        self.timeout_s = timeout_s
        self.sleep_s = sleep_s
        self.retries = retries
        self.file_extensions = file_extensions
        self.detect_files_by_content_type = detect_files_by_content_type

        self.start_parsed = urlparse(self.start_url)

        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "*/*",
            }
        )

    def _allowed(self, url: str) -> bool:
        if not self.same_domain_only:
            return True
        return _same_host(self.start_parsed, urlparse(url))

    def _request_with_retries(self, method: str, url: str, **kwargs) -> requests.Response:
        last_exc: Optional[BaseException] = None
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.request(method, url, timeout=self.timeout_s, **kwargs)
                return resp
            except (requests.Timeout, requests.ConnectionError) as exc:
                last_exc = exc
                if attempt < self.retries:
                    time.sleep(min(2**attempt, 5))
                    continue
                raise
        assert last_exc is not None
        raise last_exc

    def _should_treat_as_file(self, url: str) -> bool:
        if _looks_like_file_by_extension(url, self.file_extensions):
            return True
        return False

    def _head_content_type(self, url: str) -> str | None:
        try:
            resp = self._request_with_retries("HEAD", url, allow_redirects=True)
        except requests.RequestException:
            return None
        return resp.headers.get("Content-Type")

    def _download_file(self, url: str) -> DownloadResult | None:
        ct = None
        if self.detect_files_by_content_type:
            ct = self._head_content_type(url)
            if _is_probably_html_content_type(ct):
                return None

        resp = self._request_with_retries("GET", url, stream=True, allow_redirects=True)
        ct = resp.headers.get("Content-Type", ct)
        if resp.status_code >= 400:
            return None
        if _is_probably_html_content_type(ct):
            return None

        out_path = _output_path_for_url(self.output_dir, url, content_type=ct)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        bytes_written = 0
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 128):
                if not chunk:
                    continue
                f.write(chunk)
                bytes_written += len(chunk)

        return DownloadResult(url=url, path=out_path, bytes_written=bytes_written, status_code=resp.status_code)

    def crawl_and_download(self) -> list[DownloadResult]:
        visited_pages: set[str] = set()
        visited_urls: set[str] = set()
        downloaded: list[DownloadResult] = []

        q: deque[tuple[str, int]] = deque([(self.start_url, 0)])

        while q:
            page_url, depth = q.popleft()
            page_url = _normalize_url(page_url)
            if page_url in visited_pages:
                continue
            if not self._allowed(page_url):
                continue

            # If the "page URL" is actually a file link, download it.
            if self._should_treat_as_file(page_url):
                if page_url not in visited_urls and len(downloaded) < self.max_files:
                    visited_urls.add(page_url)
                    res = self._download_file(page_url)
                    if res:
                        downloaded.append(res)
                        print(f"Downloaded {res.url} -> {res.path} ({res.bytes_written} bytes)")
                    if self.sleep_s:
                        time.sleep(self.sleep_s)
                continue

            if len(visited_pages) >= self.max_pages:
                break

            try:
                resp = self._request_with_retries("GET", page_url, allow_redirects=True)
            except requests.RequestException as exc:
                print(f"Failed to fetch page {page_url}: {exc}", file=sys.stderr)
                continue

            visited_pages.add(page_url)

            ct = resp.headers.get("Content-Type")
            if not _is_probably_html_content_type(ct):
                # Not HTML; treat it as a downloadable file.
                if page_url not in visited_urls and len(downloaded) < self.max_files:
                    visited_urls.add(page_url)
                    res = self._download_file(page_url)
                    if res:
                        downloaded.append(res)
                        print(f"Downloaded {res.url} -> {res.path} ({res.bytes_written} bytes)")
                if self.sleep_s:
                    time.sleep(self.sleep_s)
                continue

            html = resp.text
            links = _extract_links(page_url, html)

            for link in links:
                if not self._allowed(link):
                    continue
                if link in visited_urls:
                    continue

                if self._should_treat_as_file(link):
                    if len(downloaded) >= self.max_files:
                        continue
                    visited_urls.add(link)
                    res = self._download_file(link)
                    if res:
                        downloaded.append(res)
                        print(f"Downloaded {res.url} -> {res.path} ({res.bytes_written} bytes)")
                    if self.sleep_s:
                        time.sleep(self.sleep_s)
                else:
                    # Potential HTML page.
                    if depth < self.max_depth:
                        q.append((link, depth + 1))

            if self.sleep_s:
                time.sleep(self.sleep_s)

        return downloaded


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="website_file_downloader",
        description="Download all files linked from a website (optionally crawling same-site pages).",
    )
    p.add_argument("url", help="Starting URL, e.g. https://example.com")
    p.add_argument(
        "-o",
        "--output",
        default="downloads",
        help="Output directory (default: downloads/)",
    )
    p.add_argument(
        "--depth",
        type=int,
        default=1,
        help="Crawl depth for HTML pages (default: 1). 0 means only the starting page.",
    )
    p.add_argument(
        "--any-domain",
        action="store_true",
        help="Allow crawling/downloading across domains (default is same host only).",
    )
    p.add_argument(
        "--max-pages",
        type=int,
        default=200,
        help="Maximum HTML pages to fetch (default: 200).",
    )
    p.add_argument(
        "--max-files",
        type=int,
        default=2000,
        help="Maximum files to download (default: 2000).",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Request timeout in seconds (default: 30).",
    )
    p.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Sleep seconds between requests (default: 0). Use to be polite.",
    )
    p.add_argument(
        "--retries",
        type=int,
        default=2,
        help="Retries for transient network failures (default: 2).",
    )
    p.add_argument(
        "--detect-by-content-type",
        action="store_true",
        help="Use HEAD/GET Content-Type to treat non-HTML responses as downloadable files.",
    )
    p.add_argument(
        "--ext",
        action="append",
        default=[],
        help=(
            "Additional file extension(s) to treat as files (can repeat). "
            "Example: --ext .apk --ext .iso"
        ),
    )
    p.add_argument(
        "--user-agent",
        default="website-file-downloader/1.0 (+https://github.com/)",
        help="User-Agent header to send.",
    )
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    start_url = _normalize_url(args.url)
    if not _is_http_url(start_url):
        print("Error: URL must start with http:// or https://", file=sys.stderr)
        return 2

    output_dir = Path(args.output).resolve()
    file_exts = set(DEFAULT_FILE_EXTENSIONS)
    for ext in args.ext:
        ext = ext.strip()
        if ext and not ext.startswith("."):
            ext = "." + ext
        if ext:
            file_exts.add(ext.lower())

    d = SiteDownloader(
        start_url=start_url,
        output_dir=output_dir,
        max_depth=max(0, args.depth),
        same_domain_only=not args.any_domain,
        max_pages=max(1, args.max_pages),
        max_files=max(1, args.max_files),
        timeout_s=max(1.0, args.timeout),
        sleep_s=max(0.0, args.sleep),
        retries=max(0, args.retries),
        file_extensions=file_exts,
        detect_files_by_content_type=bool(args.detect_by_content_type),
        user_agent=args.user_agent,
    )

    results = d.crawl_and_download()
    total_bytes = sum(r.bytes_written for r in results)
    print(f"\nDone. Downloaded {len(results)} files ({total_bytes} bytes) into {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
