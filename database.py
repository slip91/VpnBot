import sqlite3
from contextlib import closing
from datetime import datetime, timezone, timedelta

from config import DB_PATH

DEFAULT_SPEAKERS = [
    # Крипто-лидеры
    "Vitalik Buterin",
    "Michael Saylor",
    "Changpeng Zhao",
    "Brian Armstrong",
    "Richard Teng",
    "Brad Garlinghouse",
    "Justin Sun",
    "Sam Altman",
    "Anatoly Yakovenko",
    "Charles Hoskinson",
    # Влиятельные персоны
    "Elon Musk",
    "Cathie Wood",
    "Larry Fink",
    "Gary Gensler",
    "Jerome Powell",
    "Donald Trump",
]


def _connect():
    return sqlite3.connect(DB_PATH)


def _table_columns(conn, table: str) -> set[str]:
    """Возвращает множество имён колонок таблицы."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r[1] for r in rows}


def _migrate(conn) -> None:
    """Добавляет недостающие колонки к существующим таблицам (безопасно)."""
    # news.created_at — добавлена позже, старые БД не имеют
    # SQLite не разрешает DEFAULT CURRENT_TIMESTAMP в ALTER TABLE,
    # поэтому добавляем с NULL и заполняем текущим временем.
    if "created_at" not in _table_columns(conn, "news"):
        conn.execute("ALTER TABLE news ADD COLUMN created_at TIMESTAMP")
        conn.execute(
            "UPDATE news SET created_at = ? WHERE created_at IS NULL",
            (datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),),
        )


def init_db() -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS speakers (
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                link TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pending (
                key TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                link TEXT NOT NULL,
                speaker TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY,
                checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_items INTEGER NOT NULL DEFAULT 0,
                matched INTEGER NOT NULL DEFAULT 0,
                published INTEGER NOT NULL DEFAULT 0
            )
            """
        )

        # ── Миграции: добавляем колонки, которых может не быть в старых БД ──
        _migrate(conn)


def seed_default_speakers() -> None:
    with closing(_connect()) as conn, conn:
        for name in DEFAULT_SPEAKERS:
            conn.execute(
                "INSERT OR IGNORE INTO speakers(name) VALUES (?)", (name,)
            )


def add_speaker(name: str) -> bool:
    cleaned = name.strip()
    if not cleaned:
        return False
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO speakers(name) VALUES (?)", (cleaned,)
        )
        return cur.rowcount > 0


def remove_speaker(name: str) -> bool:
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "DELETE FROM speakers WHERE lower(name)=lower(?)", (name.strip(),)
        )
        return cur.rowcount > 0


def list_speakers() -> list[str]:
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT name FROM speakers ORDER BY name").fetchall()
    return [r[0] for r in rows]


def is_news_processed(link: str) -> bool:
    with closing(_connect()) as conn:
        row = conn.execute("SELECT 1 FROM news WHERE link=?", (link,)).fetchone()
    return row is not None


def mark_news_processed(title: str, link: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT OR IGNORE INTO news(title, link) VALUES (?, ?)", (title, link)
        )


def _utc_now_sqlite() -> str:
    """Формат совместимый с SQLite CURRENT_TIMESTAMP: 'YYYY-MM-DD HH:MM:SS'."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ──────────────────── Meta (last_check_at и т.д.) ─────────────────────


def get_meta(key: str, default: str = "") -> str:
    with closing(_connect()) as conn:
        row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def set_meta(key: str, value: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO meta(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def get_last_check_at() -> datetime | None:
    """Возвращает время последней проверки или None."""
    raw = get_meta("last_check_at")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def set_last_check_at(dt: datetime | None = None) -> None:
    dt = dt or datetime.now(timezone.utc)
    set_meta("last_check_at", dt.isoformat())


# ──────────────────── Pending posts (в базе, не в памяти) ─────────────


def save_pending(key: str, text: str, link: str, speaker: str = "") -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT OR REPLACE INTO pending(key, text, link, speaker) VALUES (?, ?, ?, ?)",
            (key, text, link, speaker),
        )


def get_pending(key: str) -> dict | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT key, text, link, speaker FROM pending WHERE key=?", (key,)
        ).fetchone()
    if not row:
        return None
    return {"key": row[0], "text": row[1], "link": row[2], "speaker": row[3]}


def update_pending_text(key: str, text: str) -> bool:
    with closing(_connect()) as conn, conn:
        cur = conn.execute("UPDATE pending SET text=? WHERE key=?", (text, key))
        return cur.rowcount > 0


def delete_pending(key: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM pending WHERE key=?", (key,))


def list_pending() -> list[dict]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT key, text, link, speaker FROM pending ORDER BY created_at"
        ).fetchall()
    return [{"key": r[0], "text": r[1], "link": r[2], "speaker": r[3]} for r in rows]


# ──────────────────── Stats ───────────────────────────────────────────


def record_check_stats(total_items: int, matched: int, published: int) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO stats(total_items, matched, published) VALUES (?, ?, ?)",
            (total_items, matched, published),
        )


def increment_published_stats() -> None:
    """Увеличивает счётчик опубликованных на 1 в последней записи stats."""
    with closing(_connect()) as conn, conn:
        conn.execute(
            "UPDATE stats SET published = published + 1 "
            "WHERE id = (SELECT id FROM stats ORDER BY checked_at DESC LIMIT 1)"
        )


def get_stats_summary() -> dict:
    """Возвращает статистику за последние 30 дней."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(total_items),0), "
            "COALESCE(SUM(matched),0), COALESCE(SUM(published),0) "
            "FROM stats WHERE checked_at >= ?",
            (cutoff,),
        ).fetchone()
    return {
        "checks": row[0],
        "total_items": row[1],
        "matched": row[2],
        "published": row[3],
    }


# ──────────────────── Cleanup ─────────────────────────────────────────


def cleanup_old_news(days: int = 30) -> int:
    """Удаляет обработанные новости старше N дней. Возвращает кол-во удалённых."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    with closing(_connect()) as conn, conn:
        cur = conn.execute("DELETE FROM news WHERE created_at < ?", (cutoff,))
        return cur.rowcount


def cleanup_old_pending(days: int = 3) -> int:
    """Удаляет pending-посты старше N дней (забытые на модерации)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    with closing(_connect()) as conn, conn:
        cur = conn.execute("DELETE FROM pending WHERE created_at < ?", (cutoff,))
        return cur.rowcount


def cleanup_old_stats(days: int = 90) -> int:
    """Удаляет статистику старше N дней."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    with closing(_connect()) as conn, conn:
        cur = conn.execute("DELETE FROM stats WHERE checked_at < ?", (cutoff,))
        return cur.rowcount
