from app.core.config import get_settings

settings = get_settings()
print(f"OPENAI_API_KEY present: {bool(settings.OPENAI_API_KEY)}")
if settings.OPENAI_API_KEY:
    print(f"Key length: {len(settings.OPENAI_API_KEY)}")
    print(f"Key prefix: {settings.OPENAI_API_KEY[:3]}...")
