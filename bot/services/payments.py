from aiogram.types import LabeledPrice


def stars_invoice_kwargs(title: str, description: str, payload: str, stars: int) -> dict:
    """Return kwargs for bot.send_invoice() using Telegram Stars (XTR)."""
    return dict(
        title=title,
        description=description,
        payload=payload,
        currency="XTR",
        prices=[LabeledPrice(label=title, amount=stars)],
        provider_token="",  # empty string required for Stars
    )
