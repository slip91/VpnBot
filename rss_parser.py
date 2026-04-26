import asyncio
import logging
import re
import ssl
from datetime import datetime, timezone, timedelta

import aiohttp
import feedparser

# ── Время ────────────────────────────────────────────────────────────────
# Первый запуск (нет last_check_at) — берём новости за последние 6 часов.
# Потолок: даже если не проверял неделю, старше 7 дней не тянем.
DEFAULT_WINDOW_HOURS = 6
MAX_WINDOW_DAYS = 7

# ── SSL ──────────────────────────────────────────────────────────────────
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# ── Фиды ─────────────────────────────────────────────────────────────────
FEEDS = [
    # Tier 1: крупнейшие крипто-СМИ
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
    "https://www.theblock.co/rss.xml",
    "https://bitcoinmagazine.com/.rss/full/",
    "https://blockworks.co/feed",

    # Tier 2: популярные крипто-медиа
    "https://cryptoslate.com/feed/",
    "https://beincrypto.com/feed/",
    "https://u.today/rss",
    "https://cryptopotato.com/feed/",
    "https://dailyhodl.com/feed/",
    "https://thedefiant.io/feed",
    "https://cryptobriefing.com/feed/",
    "https://news.bitcoin.com/feed/",
    "https://www.newsbtc.com/feed/",
    "https://ambcrypto.com/feed/",
    "https://coingape.com/feed/",
    "https://cryptonews.com/news/feed/",
    "https://protos.com/feed/",
    "https://unchainedcrypto.com/feed/",

    # Биржи и аналитика
    "https://blog.kraken.com/feed/",
    "https://blog.coinbase.com/feed",
    "https://learn.bybit.com/feed/",
    "https://coinmarketcap.com/headlines/news.xml",
    "https://research.binance.com/en/rss.xml",
    "https://www.okx.com/learn/rss",
]

# ── Регексы ──────────────────────────────────────────────────────────────
_TAG_RE = re.compile(r"<[^>]+>")
_CJK_RE = re.compile(
    r"[\u4e00-\u9fff"    # CJK Unified Ideographs
    r"\u3040-\u309f"     # Hiragana
    r"\u30a0-\u30ff"     # Katakana
    r"\uac00-\ud7af]+"   # Korean Hangul
)

# Семафор: не более 10 одновременных HTTP-запросов
_SEM = asyncio.Semaphore(10)


def _clean_text(text: str) -> str:
    """Убирает HTML-теги, CJK-символы и лишние пробелы."""
    text = _TAG_RE.sub("", text)
    text = _CJK_RE.sub("", text)
    return " ".join(text.split())


def _parse_dt(entry) -> datetime | None:
    """Парсит дату публикации из feedparser entry."""
    struct = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if struct is None:
        return None
    try:
        return datetime(*struct[:6], tzinfo=timezone.utc)
    except Exception:
        return None


async def _fetch_single(session: aiohttp.ClientSession, url: str, since: datetime) -> list[dict]:
    """Асинхронно парсит один RSS-фид. Берёт только статьи новее `since`."""
    async with _SEM:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                data = await resp.read()
        except Exception as exc:
            logging.warning("Fetch error %s: %s", url, exc)
            return []

    parsed = feedparser.parse(data)
    if parsed.bozo and not parsed.entries:
        logging.warning("Feed parse error %s: %s", url, parsed.bozo_exception)
        return []

    results = []
    for entry in getattr(parsed, "entries", []):
        pub_dt = _parse_dt(entry)
        # Без даты — пропускаем (не рискуем показать старьё)
        if pub_dt is None:
            continue
        if pub_dt < since:
            continue

        title = _clean_text(entry.get("title") or "")
        link = (entry.get("link") or "").strip()
        summary = _clean_text(
            entry.get("summary") or entry.get("description") or ""
        )
        published = (entry.get("published") or entry.get("updated") or "").strip()

        if not title or not link:
            continue

        results.append({
            "title": title,
            "link": link,
            "summary": summary,
            "published": published,
        })

    return results


async def fetch_news(last_check_at: datetime | None = None) -> list[dict[str, str]]:
    """
    Скачивает свежие новости из всех фидов параллельно.

    last_check_at: время последней проверки (из БД).
      - Если None (первый запуск) — берём последние DEFAULT_WINDOW_HOURS.
      - Потолок — MAX_WINDOW_DAYS назад.
    """
    now = datetime.now(timezone.utc)
    max_since = now - timedelta(days=MAX_WINDOW_DAYS)

    if last_check_at is None:
        since = now - timedelta(hours=DEFAULT_WINDOW_HOURS)
    else:
        since = max(last_check_at, max_since)

    logging.info(
        "RSS: fetching news since %s (window: %s)",
        since.strftime("%Y-%m-%d %H:%M UTC"),
        str(now - since).split(".")[0],
    )

    seen_links: set[str] = set()
    items: list[dict[str, str]] = []

    connector = aiohttp.TCPConnector(ssl=_SSL_CTX, limit=20)
    async with aiohttp.ClientSession(
        connector=connector,
        headers={"User-Agent": _USER_AGENT},
    ) as session:
        tasks = [_fetch_single(session, url, since) for url in FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            logging.warning("Feed task error: %s", result)
            continue
        for item in result:
            if item["link"] not in seen_links:
                seen_links.add(item["link"])
                items.append(item)

    logging.info("RSS: fetched %d unique items from %d feeds", len(items), len(FEEDS))
    return items
