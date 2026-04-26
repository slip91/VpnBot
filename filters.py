import re

# ---------------------------------------------------------------------------
# Слова — признаки ПУБЛИЧНОГО ВЫСТУПЛЕНИЯ / ПОЯВЛЕНИЯ
# ---------------------------------------------------------------------------
APPEARANCE_KEYWORDS = [
    "keynote", "keynote speaker", "keynote address",
    "speak", "speaking", "speaker", "speakers",
    "talk", "talks", "presenting", "presentation",
    "fireside chat", "fireside",
    "panel", "panelist", "moderator",
    "headline", "headlining",
    "address", "addresses",
    "appear", "appears", "appearance",
    "join", "joins", "joining",
    "take the stage", "takes the stage", "on stage",
    "live stream", "livestream", "live-stream",
    "stream", "streaming", "streams",
    "live session", "live event", "live at",
    "broadcast", "broadcasting",
    "ama", "ask me anything",
    "live interview", "live chat",
    "going live", "tune in",
    "to attend", "attending",
    "will be at", "to be at",
    "hosts", "hosting", "hosted by",
    "opening remarks", "closing remarks",
]

# ---------------------------------------------------------------------------
# Названия СОБЫТИЙ (конфы, саммиты и т.д.)
# ---------------------------------------------------------------------------
EVENT_KEYWORDS = [
    "summit", "conference", "forum", "expo", "convention",
    "hackathon", "meetup", "workshop", "symposium", "congress", "gala",
    "token2049", "devcon", "ethcc", "ethdenver", "consensus",
    "breakpoint", "solana breakpoint", "blockchain week",
    "mainnet", "messari mainnet", "permissionless",
    "bitcoin conference", "bitcoin nashville",
    "korea blockchain week", "kbw",
    "mena", "gitex", "web summit",
    "davos", "wef", "world economic forum",
    "binance blockchain week",
    "cosmoverse", "nearcon", "avalanche summit",
    "paris blockchain week", "pbw",
    "istanbul blockchain week",
    "token summit", "token event",
]

# ---------------------------------------------------------------------------
# Геополитика / война — БЛОКИРУЕМ если нет крипто-движения
# ---------------------------------------------------------------------------
WAR_KEYWORDS = [
    "war", "warfare", "military strike", "airstrike", "air strike",
    "missile attack", "bomb", "bombing", "nuclear",
    "troops", "invasion", "invaded", "ceasefire", "casualties",
    "pentagon", "nato", "sanctions against",
    "peace talks", "peace negotiations", "peace deal",
    "iran attack", "iran war", "israel war",
    "ukraine war", "russia war", "russia ukraine",
    "threatens war", "war threat", "hell on",
]

# Монеты, движение цены которых снимает блок
MAJOR_COINS = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp", "crypto"]

PRICE_MOVE_WORDS = [
    "crash", "crashed", "plunge", "plunged", "plummets", "plummeted",
    "drops", "dropped", "falls", "fell", "sinks", "sank",
    "surges", "surged", "rallies", "rallied", "pumps", "pumped",
    "spike", "spikes", "dump", "dumped",
    "new low", "all-time low", "ath", "all-time high",
    "5%", "6%", "7%", "8%", "9%", "10%", "15%", "20%",
]


# ---------------------------------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    return text.lower()


def _has_keyword(text: str, keywords: list[str]) -> str:
    """Возвращает первое найденное ключевое слово или ''."""
    lower = _normalize(text)
    for kw in keywords:
        if re.search(r"\b" + re.escape(kw) + r"\b", lower):
            return kw
    return ""


def _is_war_without_crypto_impact(text: str) -> bool:
    """True — если это геополитика без влияния на крипто (блокируем)."""
    lower = _normalize(text)

    # Есть ли военная/геополитическая тема?
    war_kw = _has_keyword(lower, WAR_KEYWORDS)
    if not war_kw:
        return False

    # Есть ли упоминание монеты И движения цены?
    has_coin = any(coin in lower for coin in MAJOR_COINS)
    has_move = any(word in lower for word in PRICE_MOVE_WORDS)

    if has_coin and has_move:
        return False  # это про влияние войны на крипто — разрешаем

    return True  # чистая геополитика — блокируем


def _find_speaker(text: str, speakers: list[str]) -> str:
    """Ищет упоминание спикера: сначала полное имя, потом по фамилии (>=5 букв)."""
    lower_text = _normalize(text)

    for speaker in speakers:
        if speaker and _normalize(speaker) in lower_text:
            return speaker

    for speaker in speakers:
        parts = speaker.strip().split()
        if not parts:
            continue
        last_name = parts[-1].lower()
        if len(last_name) >= 5 and re.search(r"\b" + re.escape(last_name) + r"\b", lower_text):
            return speaker

    return ""


# ---------------------------------------------------------------------------
# Главная функция фильтрации
# ---------------------------------------------------------------------------

def _is_crypto_price_impact(text: str) -> bool:
    """True — если новость про резкое движение цены BTC/ETH/SOL/XRP."""
    lower = _normalize(text)
    has_coin = any(coin in lower for coin in MAJOR_COINS)
    has_move = any(word in lower for word in PRICE_MOVE_WORDS)
    return has_coin and has_move


def match_news(
    title: str, description: str, speakers: list[str]
) -> tuple[bool, str, str]:
    """
    Возвращает (подходит, спикер, ключевое_слово).

    Пути к публикации:
    A) Спикер из списка + признак выступления/события → публикуем
    B) Новость про ценовой обвал/рост BTC/ETH/SOL/XRP → публикуем
       (Исключение из правила про геополитику: если война обвалила биткоин — это уже крипто-новость)
    Всё остальное, особенно чистая геополитика — блокируем.
    """
    full_text = f"{title} {title} {title} {description}"

    # Путь B: крипто-обвал/рост (не требует спикера)
    if _is_crypto_price_impact(full_text):
        return True, "", "price impact"

    # Всё остальное геополитическое — блокируем
    if _is_war_without_crypto_impact(full_text):
        return False, "", ""

    # Путь A: спикер + выступление/событие
    speaker = _find_speaker(full_text, speakers)
    if not speaker:
        return False, "", ""

    appearance = _has_keyword(full_text, APPEARANCE_KEYWORDS)
    event = _has_keyword(full_text, EVENT_KEYWORDS)

    if appearance or event:
        return True, speaker, appearance or event

    return False, "", ""
