from google import genai
import os
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
try:
    response = client.models.generate_content(
        model=os.getenv('GEMINI_MODEL', 'gemini-3.8-flash'),
        contents='Hi',
    )
    print("Success:", response.text)
except Exception as e:
    print("Error:", str(e))
