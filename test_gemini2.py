import os
from dotenv import load_dotenv
from google import genai

load_dotenv("d:/Aqua/aquaos/backend/.env")
key = os.getenv('GEMINI_API_KEY')
print("Key loaded:", bool(key))
client = genai.Client(api_key=key)

try:
    response = client.models.generate_content(
        model=os.getenv('GEMINI_MODEL', 'gemini-3.8-flash'),
        contents="Hi"
    )
    print("Response:", response.text)
except Exception as e:
    print("Exception occurred:", repr(e))
