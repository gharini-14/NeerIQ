import requests
import json

URL = 'http://127.0.0.1:8001/api/ask'
history = []

def chat(q):
    print(f"User: {q}")
    r = requests.post(URL, json={"question": q, "history": history})
    ans = r.json().get('answer', 'Error')
    print(f"NeerIQ: {ans}\n")
    history.append({"role": "user", "text": q})
    history.append({"role": "assistant", "text": ans})

chat("Hi")
chat("How are you?")
chat("Explain IoT briefly.")
chat("How much water is left?")
chat("Will it be enough for today?")
