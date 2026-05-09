import asyncio
from pathlib import Path
import sys

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import os
import openai


async def main() -> None:
    key = os.getenv("OPENAI_API_KEY", "")
    if not key or key == "sk-...":
        print("OPENAI_API_KEY not set in .env")
        sys.exit(1)

    client = openai.AsyncOpenAI(api_key=key)
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Reply with: ok"}],
            max_tokens=5,
        )
        print(f"OK — {response.choices[0].message.content.strip()}")
    except openai.AuthenticationError:
        print("FAILED — invalid API key")
        sys.exit(1)
    except Exception as e:
        print(f"FAILED — {e}")
        sys.exit(1)


asyncio.run(main())
