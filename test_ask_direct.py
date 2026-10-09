import os
import asyncio
from backend.main import ask, AskRequest
from dotenv import load_dotenv

load_dotenv("d:/Aqua/aquaos/backend/.env", override=True)

requests_data = [
    AskRequest(question="Hi"),
    AskRequest(question="How are you?", history=[{"role": "user", "text": "Hi"}, {"role": "assistant", "text": "Hello! I am NeerIQ."}]),
    AskRequest(question="Explain IoT briefly."),
    AskRequest(question="How much water is left?"),
    AskRequest(question="Will it be enough for today?")
]

for req in requests_data:
    print(f"User: {req.question}")
    resp = ask(req)
    print(f"NeerIQ: {resp.get('answer', 'Error')}\n")
