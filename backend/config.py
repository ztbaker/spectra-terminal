import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    FRED_API_KEY: str = os.getenv("FRED_API_KEY", "")
    FINNHUB_API_KEY: str = os.getenv("FINNHUB_API_KEY", "")
    BLS_API_KEY: str = os.getenv("BLS_API_KEY", "")
    EIA_API_KEY: str = os.getenv("EIA_API_KEY", "")
    CONGRESS_API_KEY: str = os.getenv("CONGRESS_API_KEY", "")
    TWITTERAPI_KEY: str = os.getenv("TWITTERAPI_KEY", "")
    DB_PATH: str = os.getenv("DB_PATH", "spectra_terminal.db")
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    SPECTRA_SHARED_KEY: str = os.getenv("SPECTRA_SHARED_KEY", "")
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_REPO: str = os.getenv("GITHUB_REPO", "")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "Spectra Terminal <onboarding@resend.dev>")
    PUBLIC_BASE_URL: str = os.getenv("PUBLIC_BASE_URL", "https://spectra-terminal-api.fly.dev")


settings = Settings()
