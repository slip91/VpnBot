"""
eSIM Access API client (esimaccess.com).

Pricing:  price field is in 1/10000 USD units (18000 = $1.80 wholesale)
Markup:   45% over wholesale
Stars:    1 Star ≈ $0.013
"""

import asyncio
import logging
import time
from math import ceil

import aiohttp

from config import ESIM_API_KEY

logger = logging.getLogger(__name__)

BASE = "https://api.esimaccess.com/api/v1/open"
MARKUP   = 1.45
UNIT2USD = 1 / 10_000
STAR_USD = 0.013

# In-memory package cache (refreshed every hour)
_cache: list[dict] = []
_cache_expires: float = 0.0
# Lock: только один запрос к eSIM API одновременно — остальные ждут кеша
_cache_lock = asyncio.Lock()


async def _post(endpoint: str, body: dict, timeout: int = 60) -> dict:
    headers = {"RT-AccessCode": ESIM_API_KEY, "Content-Type": "application/json"}
    # ssl=False: macOS Python missing system certs; use default ssl on Linux VPS
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as s:
        async with s.post(
            f"{BASE}{endpoint}", json=body, headers=headers,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as r:
            text = await r.text()
            import json as _json
            try:
                return _json.loads(text)
            except Exception as exc:
                logger.error("eSIM API JSON parse error: %s | body: %.200s", exc, text)
                return {}


async def _all_packages() -> list[dict]:
    global _cache, _cache_expires
    # Быстрый путь — кеш свежий, без блокировки
    if time.time() < _cache_expires and _cache:
        return _cache
    # Медленный путь — идём в API, но только один запрос одновременно
    async with _cache_lock:
        # Повторная проверка после получения лока (другой запрос мог уже заполнить кеш)
        if time.time() < _cache_expires and _cache:
            return _cache
        logger.info("eSIM: обновляем кеш пакетов...")
        data = await _post("/package/list", {})
        logger.info("eSIM raw response: %s", str(data)[:300])
        _cache = (data.get("obj") or {}).get("packageList") or []
        _cache_expires = time.time() + 3600
        logger.info("eSIM: кеш обновлён, пакетов: %d", len(_cache))
        return _cache


async def warm_cache():
    """Прогрев кеша при старте — вызывать из bot.py."""
    try:
        await _all_packages()
    except Exception as e:
        logger.warning("eSIM cache warm-up failed: %r", e)


# ── Public helpers ─────────────────────────────────────────────────────────────

def stars_for(price_units: int) -> int:
    """Wholesale units → Telegram Stars (with markup, rounded up)."""
    return max(1, ceil(price_units * UNIT2USD * MARKUP / STAR_USD))


def fmt_bytes(b: int) -> str:
    gb = b / 1_073_741_824
    if gb < 1:
        return f"{round(gb * 1024)} MB"
    return f"{int(gb)} GB" if gb == int(gb) else f"{gb:.1f} GB"


async def get_countries() -> list[dict]:
    """Unique countries sorted alphabetically, with package count."""
    pkgs = await _all_packages()
    seen: dict[str, dict] = {}
    for p in pkgs:
        code = p.get("locationCode", "")
        if not code:
            continue
        nets = p.get("locationNetworkList", [])
        name = nets[0]["locationName"] if nets else code
        if code not in seen:
            seen[code] = {"code": code, "name": name, "count": 0}
        seen[code]["count"] += 1
    return sorted(seen.values(), key=lambda x: x["name"])


async def get_packages_for(location_code: str) -> list[dict]:
    """All packages for a country, enriched with Stars price + human sizes."""
    pkgs = await _all_packages()
    out = []
    for p in pkgs:
        if p.get("locationCode") != location_code:
            continue
        data_type = p.get("dataType", 1)
        out.append({
            "packageCode":  p["packageCode"],
            "name":         p.get("name", ""),
            "dataLabel":    fmt_bytes(p.get("volume", 0)),
            "dataType":     data_type,       # 1=total, 2=daily (volume is per-day)
            "duration":     p.get("duration", 0),
            "durationUnit": p.get("durationUnit", "DAY").capitalize(),
            "speed":        p.get("speed", ""),
            "ipExport":     p.get("ipExport", ""),
            "price":        p.get("price", 0),
            "stars":        stars_for(p.get("price", 0)),
        })
    return sorted(out, key=lambda x: (x["price"], x["duration"]))


async def place_order(package_code: str, wholesale_price: int, tx_id: str) -> dict:
    """Place eSIM order. Returns raw API response."""
    return await _post("/esim/order", {
        "transactionId": tx_id,
        "packageInfoList": [{"packageCode": package_code, "count": 1, "price": wholesale_price}],
    })


async def query_esim(iccid: str) -> dict:
    """Query eSIM details by ICCID to get QR / activation code."""
    return await _post("/esim/query", {
        "iccid": iccid,
        "pager": {"pageNum": 1, "pageSize": 1},
    })
