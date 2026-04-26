"""
Парсер социальных сетей — X (Twitter).

Использует twikit (неофициальный клиент, работает через куки, бесплатно).
Документация: https://github.com/d60/twikit

Установка: pip install twikit

Для работы нужны учётные данные X в .env:
    TWITTER_USERNAME=yourhandle
    TWITTER_EMAIL=your@email.com
    TWITTER_PASSWORD=yourpassword

При первом запуске бот логинится и сохраняет куки в twitter_cookies.json.
При последующих — использует куки без повторного логина.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# twikit опциональный — если не установлен, Twitter просто отключается
try:
    from twikit import Client as TwiClient
    from twikit.errors import BadRequest, Unauthorized, RateLimitExceeded
    TWIKIT_AVAILABLE = True
except ImportError:
    TWIKIT_AVAILABLE = False
    logger.info("twikit not installed — Twitter search disabled")

from config import (
    TWITTER_USERNAME,
    TWITTER_EMAIL,
    TWITTER_PASSWORD,
    TWITTER_COOKIES_PATH,
)
from filters import APPEARANCE_KEYWORDS, EVENT_KEYWORDS

_tw_client: "TwiClient | None" = None
_tw_enabled: bool = True  # выставляем в False при ошибке авторизации


async def _get_client() -> "TwiClient | None":
    """Возвращает авторизованный клиент Twitter (синглтон)."""
    global _tw_client, _tw_enabled

    if not _tw_enabled or not TWIKIT_AVAILABLE:
        return None
    if not (TWITTER_USERNAME and TWITTER_EMAIL and TWITTER_PASSWORD):
        return None
    if _tw_client is not None:
        return _tw_client

    client = TwiClient("en-US")
    cookies_file = Path(TWITTER_COOKIES_PATH)

    try:
        if cookies_file.exists():
            client.load_cookies(str(cookies_file))
            logger.info("Twitter: loaded cookies from %s", cookies_file)
        else:
            logger.info("Twitter: logging in as @%s...", TWITTER_USERNAME)
            await client.login(
                auth_info_1=TWITTER_USERNAME,
                auth_info_2=TWITTER_EMAIL,
                password=TWITTER_PASSWORD,
            )
            client.save_cookies(str(cookies_file))
            logger.info("Twitter: logged in, cookies saved to %s", cookies_file)

        _tw_client = client
        return client

    except Exception as exc:
        logger.warning("Twitter login failed: %s — disabling Twitter", exc)
        _tw_enabled = False
        return None


def _build_query(speakers: list[str]) -> str:
    """
    Строит поисковый запрос для X.

    Логика:
      (фамилия1 OR фамилия2 OR ...) (keynote OR speaking OR stream OR ...) lang:en -is:retweet

    Берём только фамилии — они точнее работают в поиске Twitter.
    Ограничиваем 12 спикерами чтобы запрос не вышел за лимит 512 символов.
    """
    last_names = []
    for speaker in speakers[:12]:
        parts = speaker.strip().split()
        if not parts:
            continue
        # Если имя одно слово — берём его, иначе фамилию
        name = parts[-1] if len(parts) > 1 else parts[0]
        if len(name) >= 4:
            last_names.append(name)

    if not last_names:
        return ""

    # Сэмпл ключевых слов появлений (берём самые значимые, не все)
    appear_sample = [
        "keynote", "speaking", "livestream", "stream",
        "AMA", "panel", "fireside", "summit", "conference",
    ]
    # Добавляем пару конкретных событий из EVENT_KEYWORDS
    event_sample = [
        kw for kw in EVENT_KEYWORDS
        if len(kw) > 6 and " " not in kw  # только короткие без пробела
    ][:5]

    speakers_str = " OR ".join(last_names)
    appear_str = " OR ".join(appear_sample + event_sample)

    query = f"({speakers_str}) ({appear_str}) lang:en -is:retweet min_faves:5"
    return query


def _tweet_to_item(tweet) -> dict[str, str]:
    """Конвертирует твит в формат, совместимый с rss_parser.fetch_news()."""
    url = f"https://x.com/{tweet.user.screen_name}/status/{tweet.id}"
    # Первые 120 символов как «заголовок»
    title = tweet.full_text[:120].replace("\n", " ").strip()
    if len(tweet.full_text) > 120:
        title += "…"

    return {
        "title": title,
        "link": url,
        "summary": tweet.full_text,
        "published": str(tweet.created_at),
        "source": f"@{tweet.user.screen_name} (X)",
    }


async def fetch_social_news(speakers: list[str]) -> list[dict[str, str]]:
    """
    Ищет твиты о выступлениях спикеров из списка.

    Возвращает список в том же формате что и rss_parser.fetch_news(),
    поэтому интегрируется в существующий pipeline без изменений.
    """
    global _tw_enabled

    client = await _get_client()
    if client is None:
        return []

    query = _build_query(speakers)
    if not query:
        return []

    logger.info("Twitter search: %s", query[:120])

    try:
        tweets = await client.search_tweet(query, product="Latest", count=30)
        items = []

        for tweet in tweets:
            # Пропускаем слишком короткие — скорее всего мусор
            if len(tweet.full_text) < 60:
                continue
            items.append(_tweet_to_item(tweet))

        logger.info("Twitter: got %d tweets", len(items))
        return items

    except RateLimitExceeded:
        logger.warning("Twitter rate limit hit — skipping this cycle")
        return []

    except Unauthorized:
        logger.warning("Twitter session expired — deleting cookies, will re-login next cycle")
        cookies_file = Path(TWITTER_COOKIES_PATH)
        if cookies_file.exists():
            cookies_file.unlink()
        global _tw_client
        _tw_client = None
        return []

    except Exception as exc:
        logger.warning("Twitter search error: %s", exc)
        return []
