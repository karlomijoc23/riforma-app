"""Quick smoke test for Anthropic Claude API connectivity."""

import os
import sys

# Add path to sys to find app (backend root)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import get_settings  # noqa: E402

try:
    import anthropic  # noqa: E402
except ImportError:
    print("anthropic SDK not installed. Run: pip install anthropic")
    sys.exit(1)

settings = get_settings()
api_key = settings.ANTHROPIC_API_KEY

if not api_key:
    print("No ANTHROPIC_API_KEY found")
    sys.exit(1)

client = anthropic.Anthropic(api_key=api_key)

try:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=50,
        messages=[
            {
                "role": "user",
                "content": "Hello, are you working? Reply in one sentence.",
            }
        ],
    )
    print("API Call Successful")
    print(response.content[0].text)
except Exception as e:
    print(f"API Call Failed: {e}")
