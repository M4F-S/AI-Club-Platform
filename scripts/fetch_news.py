#!/usr/bin/env python3
"""Fetch AI/tech headlines and write /opt/42berlinaiclub/news.json (atomic)."""
import json, os, re, sys, time, html
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUT = "/opt/42berlinaiclub/news.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; 42BerlinAIClubNews/1.0; +https://42berlinaiclub.de)"}
ATOM = "{http://www.w3.org/2005/Atom}"

FEEDS = [
    ("TechCrunch",   "https://techcrunch.com/category/artificial-intelligence/feed/", 6),
    ("The Verge",    "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", 5),
    ("MIT Tech Review", "https://www.technologyreview.com/topic/artificial-intelligence/feed/", 4),
    ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/technology-lab", 4),
    ("Google AI",    "https://blog.google/technology/ai/rss/", 3),
    ("OpenAI",       "https://openai.com/news/rss.xml", 3),
    ("Hacker News",  "https://news.ycombinator.com/rss", 4),
]
MAX_ITEMS = 14


def clean(t: str) -> str:
    t = html.unescape(t or "")
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\s+", " ", t).strip()


def parse_date(node):
    for tag in ("pubDate", ATOM + "updated", ATOM + "published", "published", "updated"):
        el = node.find(tag)
        if el is not None and el.text:
            raw = el.text.strip()
            try:
                dt = parsedate_to_datetime(raw)
            except Exception:
                try:
                    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                except Exception:
                    continue
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
    return None


def fetch(name, url, limit):
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=20).read()
    root = ET.fromstring(raw)
    nodes = root.findall(".//item") or root.findall(f".//{ATOM}entry")
    out = []
    for n in nodes[:limit]:
        t = n.find("title")
        if t is None:
            t = n.find(ATOM + "title")
        title = clean(t.text if t is not None else "")
        link = ""
        l = n.find("link")
        if l is not None and l.text:
            link = l.text.strip()
        elif l is not None and l.get("href"):
            link = l.get("href")
        if not link:
            for le in n.findall(ATOM + "link"):
                if le.get("rel") in (None, "alternate"):
                    link = le.get("href", "")
                    break
        dt = parse_date(n)
        if len(title) >= 20 and link.startswith("http"):
            out.append({
                "title": title[:180],
                "link": link,
                "source": name,
                "published": dt.isoformat() if dt else None,
                "ts": dt.timestamp() if dt else 0,
            })
    return out


def main():
    items, errors = [], []
    for name, url, limit in FEEDS:
        try:
            items.extend(fetch(name, url, limit))
        except Exception as e:
            errors.append(f"{name}: {type(e).__name__}: {e}")

    # dedupe by normalised title, newest first
    seen, uniq = set(), []
    for it in sorted(items, key=lambda x: x["ts"], reverse=True):
        key = re.sub(r"[^a-z0-9 ]", "", it["title"].lower())[:70]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)

    uniq = uniq[:MAX_ITEMS]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(uniq),
        "items": uniq,
    }

    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    os.chmod(OUT, 0o644)

    print(f"[{datetime.now(timezone.utc).isoformat()}] wrote {len(uniq)} items"
          + (f" | errors: {'; '.join(errors)}" if errors else ""))


if __name__ == "__main__":
    main()
