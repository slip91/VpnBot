import asyncio
import logging
import uuid

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
)

from ai_writer import rewrite_news
from config import ADMIN_ID, CHANNEL_ID, TELEGRAM_BOT_TOKEN
from database import (
    add_speaker,
    cleanup_old_news,
    cleanup_old_pending,
    cleanup_old_stats,
    delete_pending,
    get_last_check_at,
    get_pending,
    get_stats_summary,
    increment_published_stats,
    init_db,
    is_news_processed,
    list_pending,
    list_speakers,
    mark_news_processed,
    record_check_stats,
    remove_speaker,
    save_pending,
    seed_default_speakers,
    set_last_check_at,
    update_pending_text,
)
from filters import match_news
from rss_parser import fetch_news

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

router = Router()

process_lock = asyncio.Lock()

# Лёгкое состояние в памяти (не критично при перезапуске)
waiting_for_speaker: set[int] = set()
editing_posts: dict[int, str] = {}   # user_id -> pending key

BTN_SPEAKERS = "📋 Спикеры"
BTN_ADD_SPEAKER = "➕ Добавить спикера"
BTN_FORCE_CHECK = "🔎 Проверить новости"
BTN_HELP = "ℹ️ Помощь"


def main_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=BTN_FORCE_CHECK)],
            [KeyboardButton(text=BTN_SPEAKERS), KeyboardButton(text=BTN_ADD_SPEAKER)],
            [KeyboardButton(text=BTN_HELP)],
        ],
        resize_keyboard=True,
    )


def moderation_kb(key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Опубликовать", callback_data=f"pub:{key}"),
                InlineKeyboardButton(text="❌ Отклонить", callback_data=f"rej:{key}"),
            ],
            [
                InlineKeyboardButton(text="✏️ Редактировать", callback_data=f"edt:{key}"),
            ],
        ]
    )


async def _safe_send(target, chat_id: int, text: str, **kwargs) -> None:
    """Отправляет сообщение. Если Markdown упал — шлёт без форматирования."""
    try:
        await target.send_message(chat_id, text, parse_mode="Markdown", **kwargs)
    except Exception:
        await target.send_message(chat_id, text, **kwargs)


async def _safe_answer(message: Message, text: str, **kwargs) -> None:
    """message.answer с Markdown fallback."""
    try:
        await message.answer(text, parse_mode="Markdown", **kwargs)
    except Exception:
        kw = {k: v for k, v in kwargs.items() if k != "parse_mode"}
        await message.answer(text, **kw)


def admin_only(message: Message) -> bool:
    return bool(message.from_user and message.from_user.id == ADMIN_ID)


# ──────────────────────── Команды ──────────────────────────


@router.message(Command("start"))
async def cmd_start(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    await message.answer(
        "👋 Привет! Слежу за крипто-конференциями и выступлениями спикеров.\n\n"
        "Нажми «🔎 Проверить новости» — найду свежее и пришлю на модерацию.",
        reply_markup=main_keyboard(),
    )


@router.message(Command("help"))
@router.message(F.text == BTN_HELP)
async def cmd_help(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    await message.answer(
        "Команды:\n"
        "/speakers — список спикеров\n"
        "/addspeaker Имя — добавить спикера\n"
        "/removespeaker Имя — удалить спикера\n"
        "/sources — RSS-источники\n"
        "/stats — статистика за 30 дней\n"
        "/pending — посты на модерации",
        reply_markup=main_keyboard(),
    )


@router.message(Command("addspeaker"))
async def cmd_addspeaker(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    name = (message.text or "").replace("/addspeaker", "", 1).strip()
    if not name:
        await message.answer("Использование: /addspeaker Имя Фамилия")
        return
    ok = add_speaker(name)
    await message.answer(
        f"✅ Добавлен: {name}" if ok else f"⚠️ {name} уже есть в списке."
    )


@router.message(Command("removespeaker"))
async def cmd_removespeaker(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    name = (message.text or "").replace("/removespeaker", "", 1).strip()
    if not name:
        await message.answer("Использование: /removespeaker Имя Фамилия")
        return
    ok = remove_speaker(name)
    await message.answer(
        f"🗑 Удалён: {name}" if ok else f"⚠️ {name} не найден."
    )


@router.message(Command("speakers"))
@router.message(F.text == BTN_SPEAKERS)
async def cmd_speakers(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    speakers = list_speakers()
    if not speakers:
        await message.answer("Список пуст. Добавь: /addspeaker Имя Фамилия")
        return

    # Inline-кнопки для удаления каждого спикера
    # callback_data ограничена 64 байтами — обрезаем если имя слишком длинное
    buttons = []
    for s in speakers:
        cb_data = f"delspeaker:{s}"
        if len(cb_data.encode("utf-8")) > 64:
            cb_data = f"delspeaker:{s[:20]}"
        buttons.append([
            InlineKeyboardButton(text=s, callback_data="noop"),
            InlineKeyboardButton(text="🗑", callback_data=cb_data),
        ])
    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    await message.answer(f"🎤 Спикеры ({len(speakers)}):", reply_markup=kb)


@router.message(Command("sources"))
async def cmd_sources(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    from rss_parser import FEEDS
    lines = "\n".join(f"{i+1}. {url}" for i, url in enumerate(FEEDS))
    await message.answer(f"📡 Источники ({len(FEEDS)}):\n\n{lines}")


@router.message(Command("stats"))
async def cmd_stats(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    s = get_stats_summary()
    last = get_last_check_at()
    last_str = last.strftime("%d.%m.%Y %H:%M UTC") if last else "никогда"
    pending_count = len(list_pending())
    await message.answer(
        f"📊 Статистика за 30 дней:\n\n"
        f"Проверок: {s['checks']}\n"
        f"Всего новостей просмотрено: {s['total_items']}\n"
        f"Прошли фильтр: {s['matched']}\n"
        f"Опубликовано: {s['published']}\n"
        f"На модерации сейчас: {pending_count}\n\n"
        f"Последняя проверка: {last_str}",
    )


@router.message(Command("pending"))
async def cmd_pending(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    posts = list_pending()
    if not posts:
        await message.answer("Нет постов на модерации.")
        return
    await message.answer(f"📝 На модерации: {len(posts)} постов. Отправляю...")
    for post in posts:
        preview = post["text"]
        if post["link"]:
            preview += f"\n\n🔗 [Источник]({post['link']})"
        await _safe_send(
            message.bot, ADMIN_ID, preview,
            reply_markup=moderation_kb(post["key"]),
            disable_web_page_preview=True,
        )
        await asyncio.sleep(0.5)


# ──────────────────── Кнопки клавиатуры ────────────────────────


@router.message(F.text == BTN_ADD_SPEAKER)
async def btn_add_speaker(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    waiting_for_speaker.add(message.from_user.id)
    await message.answer("Напиши имя спикера (например: Vitalik Buterin):")


@router.message(F.text == BTN_FORCE_CHECK)
async def btn_force_check(message: Message) -> None:
    if not admin_only(message):
        await message.answer("⛔ Доступ запрещён.")
        return
    await message.answer("🔎 Проверяю...")

    # Очистка при каждой проверке
    cleaned_news = cleanup_old_news(days=30)
    cleaned_pending = cleanup_old_pending(days=3)
    cleaned_stats = cleanup_old_stats(days=90)
    if cleaned_news or cleaned_pending or cleaned_stats:
        logger.info(
            "Cleanup: news=%d pending=%d stats=%d",
            cleaned_news, cleaned_pending, cleaned_stats,
        )

    sent_count = await process_feeds(message.bot)
    if sent_count:
        await message.answer(f"Готово — нашёл {sent_count} новостей на модерацию.")
    else:
        await message.answer("Ничего нового пока нет.")


# ──────────────────── Ввод текста (спикер / редактирование) ────────────


@router.message(F.text & ~F.text.startswith("/"))
async def handle_text(message: Message) -> None:
    if not admin_only(message):
        return
    user_id = message.from_user.id
    text = (message.text or "").strip()

    # Режим редактирования поста
    if user_id in editing_posts:
        key = editing_posts.pop(user_id)
        post = get_pending(key)
        if not post:
            await message.answer("Пост уже недоступен — возможно, был отклонён или опубликован.")
            return
        update_pending_text(key, text)
        preview_text = text
        if post["link"]:
            preview_text += f"\n\n🔗 [Источник]({post['link']})"
        await _safe_answer(
            message, preview_text,
            reply_markup=moderation_kb(key),
            disable_web_page_preview=True,
        )
        return

    # Режим добавления спикера
    if user_id in waiting_for_speaker:
        waiting_for_speaker.discard(user_id)
        if not text:
            await message.answer("Имя не может быть пустым.")
            return
        ok = add_speaker(text)
        await message.answer(
            f"✅ Добавлен: {text}" if ok else f"⚠️ {text} уже есть в списке."
        )
        return


# ──────────────────── Модерация (inline-кнопки) ────────────────────────


@router.callback_query(F.data.startswith("pub:"))
async def cb_publish(callback: CallbackQuery) -> None:
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("⛔ Доступ запрещён", show_alert=True)
        return
    key = callback.data.split(":", 1)[1]
    post = get_pending(key)
    if post:
        channel_text = post["text"]
        if post["link"]:
            channel_text += f"\n\n🔗 [Источник]({post['link']})"
        await _safe_send(
            callback.bot, CHANNEL_ID, channel_text,
            disable_web_page_preview=True,
        )
        delete_pending(key)
        increment_published_stats()

        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.answer("✅ Опубликовано")
    else:
        await callback.answer("Пост уже недоступен")


@router.callback_query(F.data.startswith("rej:"))
async def cb_reject(callback: CallbackQuery) -> None:
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("⛔ Доступ запрещён", show_alert=True)
        return
    key = callback.data.split(":", 1)[1]
    delete_pending(key)
    editing_posts.pop(callback.from_user.id, None)
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("❌ Отклонено")


@router.callback_query(F.data.startswith("edt:"))
async def cb_edit(callback: CallbackQuery) -> None:
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("⛔ Доступ запрещён", show_alert=True)
        return
    key = callback.data.split(":", 1)[1]
    post = get_pending(key)
    if not post:
        await callback.answer("Пост уже недоступен")
        return
    editing_posts[callback.from_user.id] = key
    await callback.answer()
    await callback.message.answer(
        "Пришли исправленный текст поста — он заменит текущий и появится снова на модерацию:"
    )


@router.callback_query(F.data.startswith("delspeaker:"))
async def cb_delete_speaker(callback: CallbackQuery) -> None:
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("⛔ Доступ запрещён", show_alert=True)
        return
    name = callback.data.split(":", 1)[1]
    ok = remove_speaker(name)
    if ok:
        await callback.answer(f"🗑 Удалён: {name}")
        # Обновляем список — убираем удалённого
        speakers = list_speakers()
        if speakers:
            buttons = []
            for s in speakers:
                cb_data = f"delspeaker:{s}"
                if len(cb_data.encode("utf-8")) > 64:
                    cb_data = f"delspeaker:{s[:20]}"
                buttons.append([
                    InlineKeyboardButton(text=s, callback_data="noop"),
                    InlineKeyboardButton(text="🗑", callback_data=cb_data),
                ])
            kb = InlineKeyboardMarkup(inline_keyboard=buttons)
            await callback.message.edit_text(
                f"🎤 Спикеры ({len(speakers)}):", reply_markup=kb
            )
        else:
            await callback.message.edit_text("Список спикеров пуст.")
    else:
        await callback.answer(f"⚠️ {name} не найден")


@router.callback_query(F.data == "noop")
async def cb_noop(callback: CallbackQuery) -> None:
    await callback.answer()


# ──────────────────── Дедупликация по содержанию ──────────────────


def _extract_dedup_key(title: str, speaker: str) -> str:
    """Простой ключ дедупликации: спикер + первые 5 значимых слов заголовка."""
    stop_words = {"the", "a", "an", "is", "at", "in", "on", "for", "of", "to", "and", "or", "with"}
    words = [w.lower() for w in title.split() if w.lower() not in stop_words]
    core = " ".join(words[:5])
    return f"{speaker.lower()}|{core}"


# ──────────────────── Обработка фидов ──────────────────


async def process_feeds(bot: Bot) -> int:
    async with process_lock:
        speakers = list_speakers()
        sent_count = 0
        skipped_processed = 0
        skipped_filter = 0
        skipped_dedup = 0
        total_items = 0

        last_check = get_last_check_at()

        items = await fetch_news(last_check_at=last_check)

        # Ключи дедупликации уже ожидающих постов
        existing_pending = list_pending()
        seen_dedup_keys: set[str] = set()
        for p in existing_pending:
            dk = _extract_dedup_key(p.get("text", "")[:100], p.get("speaker", ""))
            seen_dedup_keys.add(dk)

        for item in items:
            total_items += 1
            if is_news_processed(item["link"]):
                skipped_processed += 1
                continue

            ok, speaker, keyword = match_news(item["title"], item["summary"], speakers)
            if not ok:
                skipped_filter += 1
                continue

            # Дедупликация по содержанию
            dedup_key = _extract_dedup_key(item["title"], speaker)
            if dedup_key in seen_dedup_keys:
                skipped_dedup += 1
                logger.info("Dedup skip: %s", item["title"][:70])
                mark_news_processed(item["title"], item["link"])
                continue
            seen_dedup_keys.add(dedup_key)

            logger.info("Match: %s | %s | %s", item["title"][:70], speaker or "—", keyword or "—")

            try:
                rewritten = await rewrite_news(
                    title=item["title"],
                    summary=item["summary"],
                    published=item["published"],
                    speaker=speaker,
                    link=item["link"],
                )
            except Exception:
                logger.exception("Rewrite failed: %s", item["title"][:70])
                continue

            key = uuid.uuid4().hex[:8]
            save_pending(key, rewritten, item["link"], speaker)
            mark_news_processed(item["title"], item["link"])

            preview_text = rewritten
            if item["link"]:
                preview_text += f"\n\n🔗 [Источник]({item['link']})"

            await _safe_send(
                bot, ADMIN_ID, preview_text,
                reply_markup=moderation_kb(key),
                disable_web_page_preview=True,
            )
            sent_count += 1
            await asyncio.sleep(0.5)

        # Записываем время последней проверки и статистику
        set_last_check_at()
        record_check_stats(total_items, sent_count, 0)

        logger.info(
            "total=%d processed=%d filtered=%d dedup=%d sent=%d",
            total_items, skipped_processed, skipped_filter, skipped_dedup, sent_count,
        )
        return sent_count


# ──────────────────── Запуск ───────────────────────────


async def main() -> None:
    init_db()
    seed_default_speakers()

    bot = Bot(token=TELEGRAM_BOT_TOKEN)
    dp = Dispatcher()
    dp.include_router(router)

    logger.info("Starting. Admin=%s Channel=%s", ADMIN_ID, CHANNEL_ID)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
