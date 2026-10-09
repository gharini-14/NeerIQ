import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "OPENAI_API_KEY is missing. Add it to backend/.env"
    )

client = OpenAI(api_key=API_KEY)

MODEL = "gpt-6-luna"


def ask_NeerIQ_ai(question, system_data):

    water = system_data.get("water", {})
    analytics = system_data.get("analytics", {})
    prediction = system_data.get("prediction", {})

    prompt = f"""
You are NeerIQ AI, the intelligent water-management
assistant for the NeerIQ Smart Water Management Platform.

NeerIQ follows:

SENSE → UNDERSTAND → PREDICT → ALERT → ACT

Your job is to analyze the actual NeerIQ system data
and answer the user's question.

RULES:

1. Use only the supplied NeerIQ data.
2. Never invent sensor values.
3. Explain technical information in simple language.
4. If leakage is detected, explain the evidence.
5. If an anomaly exists, explain the deviation.
6. Mention prediction data when relevant.
7. Give a practical action recommendation.
8. Never claim that you physically controlled a pump,
   valve, motor, or other hardware unless the backend
   actually performed that action.
9. Keep answers concise but useful.
10. For important problems use:

WHAT:
WHY:
PREDICTION:
ACTION:

CURRENT NeerIQ WATER DATA:
{water}

CURRENT NeerIQ ANALYTICS:
{analytics}

CURRENT NeerIQ PREDICTION:
{prediction}

USER QUESTION:
{question}
"""

    response = client.responses.create(
        model=MODEL,
        input=prompt,
    )

    return response.output_text