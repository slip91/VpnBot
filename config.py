import os

from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
CHANNEL_ID = int(os.getenv("CHANNEL_ID", "0"))

DB_PATH = os.getenv("DB_PATH", "bot.db")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemma-3-1b-it:free")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
