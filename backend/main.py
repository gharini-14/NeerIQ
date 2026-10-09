from datetime import datetime
from typing import Any
import os
from dotenv import load_dotenv
from google import genai

load_dotenv(override=True)
try:
    gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
except Exception:
    gemini_client = None

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import data_engine as engine

app = FastAPI(title="NeerIQ Water Management API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REFILL_THRESHOLD_PERCENT = 30.0

class AskRequest(BaseModel):
    question: str
    history: list[dict[str, Any]] = []


def _latest() -> dict[str, Any]:
    return engine.get_latest_reading()


def _status_payload() -> dict[str, Any]:
    latest = _latest()
    analytics = engine.get_analytics()
    capacity = float(analytics.get("usage", {}).get("tank_capacity", 4000) or 4000)
    litres = float(latest.get("tank_volume", 0) or 0)
    flow_lpm = float(latest.get("flow_rate", 0) or 0)
    level = round((litres / capacity) * 100, 1) if capacity else 0
    remaining_minutes = (litres / flow_lpm) if flow_lpm > 0.1 else None
    threshold_litres = capacity * REFILL_THRESHOLD_PERCENT / 100
    litres_to_threshold = max(0, litres - threshold_litres)
    threshold_minutes = (litres_to_threshold / flow_lpm) if flow_lpm > 0.1 else None
    if level <= 15:
        refill_message = "Refill urgently: tank level is critically low."
    elif level <= REFILL_THRESHOLD_PERCENT:
        refill_message = "Refill recommended: tank is at or below the configured threshold."
    else:
        refill_message = f"Current level is above the {REFILL_THRESHOLD_PERCENT:.0f}% refill threshold."
    abnormal = bool(latest.get("anomaly_detected") or latest.get("leakage_detected"))
    health = "ATTENTION REQUIRED" if abnormal else "NORMAL"
    return {
        **latest,
        "tank_capacity": capacity,
        "tank_level": level,
        "tank_volume": round(litres, 1),
        "remaining_minutes_estimate": round(remaining_minutes, 1) if remaining_minutes is not None else None,
        "threshold_minutes_estimate": round(threshold_minutes, 1) if threshold_minutes is not None else None,
        "refill_threshold_percent": REFILL_THRESHOLD_PERCENT,
        "refill_guidance": refill_message,
        "system_health": health,
        "data_mode": "SIMULATED DEMO DATA",
        "calculated_at": datetime.now().isoformat(),
    }


@app.get("/")
def root():
    return {"name": "NeerIQ API", "status": "running", "data_mode": "simulated"}

@app.get("/api/water-status")
def water_status():
    return _status_payload()

@app.get("/api/latest")
def latest():
    return _status_payload()

@app.get("/api/one-touch-status")
def one_touch_status():
    """One-touch status uses the latest simulation reading and arithmetic estimates only."""
    return _status_payload()

@app.get("/api/water-history")
def water_history():
    rows = engine.get_water_history()
    return {"data": rows, "count": len(rows), "data_mode": "SIMULATED DEMO DATA"}

@app.get("/api/analytics")
def analytics():
    result = engine.get_analytics()
    result["data_mode"] = "SIMULATED DEMO DATA"
    return result

@app.get("/api/ai-insight")
def ai_insight():
    latest = _status_payload()
    if latest.get("leakage_detected"):
        return {
            "available": True,
            "severity": "WARNING",
            "what": {"message": "An unusual flow pattern may indicate water wastage."},
            "why": {"message": "The simulated flow readings are above the recent baseline. A real installation would need meter/sensor confirmation."},
            "action": {"message": "Inspect the relevant pipe/zone and compare with a physical meter before concluding that a leak exists."},
            "source": "NeerIQ rule-based insight",
        }
    if latest.get("anomaly_detected"):
        return {
            "available": True,
            "severity": "WARNING",
            "what": {"message": "Water flow is different from the recent baseline."},
            "why": {"message": latest.get("anomaly_message", "A flow variation was detected.")},
            "action": {"message": "Check whether the change matches normal building activity."},
            "source": "NeerIQ rule-based insight",
        }
    return {
        "available": True,
        "severity": "GOOD",
        "what": {"message": "No unusual flow pattern is currently flagged."},
        "why": {"message": f"Current simulated flow is {latest.get('flow_rate', 0)} L/min and tank level is {latest.get('tank_level', 0)}%."},
        "action": {"message": "Continue monitoring and refill when the configured threshold is reached."},
        "source": "NeerIQ rule-based insight",
    }

@app.post("/api/ask")
def ask(request: AskRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    status = _status_payload()
    analytics_data = engine.get_analytics()
    
    if gemini_client:
        try:
            if not os.getenv("GEMINI_API_KEY"):
                raise ValueError("API key missing or empty.")

            model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
            
            history_text = ""
            for msg in request.history:
                r = "User" if msg.get("role") == "user" else "NeerIQ"
                history_text += f"{r}: {msg.get('text', '')}\n"

            prompt = f"""You are NeerIQ, a friendly and conversational AI smart water management assistant.
Behave like a natural conversational AI (similar to ChatGPT).
- If the user greets you (e.g., "Hi", "Hello"), respond naturally and warmly. Do NOT force water data into greetings.
- If the user asks general questions (e.g., "Explain IoT", "How are you?"), answer them helpfully.
- If the user asks about the water system (e.g., tank levels, usage, leaks, refill), use the CURRENT SYSTEM STATUS below to answer accurately. Never invent water measurements. Mention it is simulated demo data if appropriate.

CURRENT SYSTEM STATUS (Use only if relevant to the user's query):
- Tank Level: {status['tank_level']}% ({status['tank_volume']} L)
- Flow Rate: {status.get('flow_rate', 0)} L/min
- System Health: {status['system_health']}
- Today's Usage: {analytics_data.get('usage', {}).get('today', 0)} L
- Refill Guidance: {status['refill_guidance']}

CHAT HISTORY:
{history_text}
User: {question}
NeerIQ:"""
            
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            return {"answer": response.text, "source": f"NeerIQ AI powered by Gemini ({model_name})", "data_mode": "LIVE AI"}
        except Exception as e:
            err_str = str(e).lower()
            if "api key" in err_str or "unauthenticated" in err_str or "403" in err_str or "key missing" in err_str:
                err_msg = "Invalid or missing API key."
            elif "quota" in err_str or "429" in err_str or "exhausted" in err_str:
                err_msg = "API quota exceeded. Please try again later."
            elif "model" in err_str or "404" in err_str or "not found" in err_str:
                err_msg = f"Model {os.getenv('GEMINI_MODEL', 'gemini-3.8-flash')} is currently unavailable."
            elif "network" in err_str or "connection" in err_str:
                err_msg = "Network connection error while reaching Gemini API."
            else:
                err_msg = f"AI Service Error: {str(e)}"
            
            print(f"Gemini API Error: {err_msg} -> Falling back to local intelligence.")
            # Fall through to local intelligence rule-based logic below

    q = question.lower()
    if any(word in q for word in ["level", "litre", "liter", "tank", "water left"]):
        answer = f"The tank is at {status['tank_level']}%, with about {status['tank_volume']:,.0f} L available out of {status['tank_capacity']:,.0f} L. These are simulated demo readings."
    elif any(word in q for word in ["time", "empty", "last", "remaining"]):
        estimate = status.get("remaining_minutes_estimate")
        if estimate is None:
            answer = "I cannot estimate remaining time because the current flow rate is unavailable or too low."
        else:
            answer = f"At the current simulated flow rate, the arithmetic estimate is about {estimate / 60:.1f} hours remaining. This assumes the flow stays constant; it is not an ML prediction."
    elif any(word in q for word in ["refill", "when should", "threshold"]):
        answer = status["refill_guidance"] + f" Configured threshold: {status['refill_threshold_percent']:.0f}%."
    elif any(word in q for word in ["leak", "waste", "abnormal", "unusual"]):
        answer = ("NeerIQ has flagged a possible unusual flow pattern. This is a rule-based warning, not confirmation of a real leak; check the physical meter and inspect the zone." if status.get("leakage_detected") or status.get("anomaly_detected") else "No unusual flow pattern is currently flagged in the simulated readings. This cannot rule out a real leak.")
    elif any(word in q for word in ["usage", "consume", "today", "daily"]):
        answer = f"Estimated usage for today is {analytics_data.get('usage', {}).get('today', status.get('daily_usage', 0)):,.0f} L in the simulation."
    else:
        answer = f"Current status: tank {status['tank_level']}% ({status['tank_volume']:,.0f} L), flow {status.get('flow_rate', 0)} L/min, system health {status['system_health']}. {status['refill_guidance']} All values are simulated demo data."
    return {"answer": answer, "source": "NeerIQ Local Intelligence", "data_mode": "SIMULATED DEMO DATA"}

@app.post("/api/demo/reset")
def reset_demo():
    engine.water_history.clear()
    engine.current_tank_liters = engine.TANK_CAPACITY_LITERS * engine.INITIAL_TANK_LEVEL / 100
    engine.daily_usage_liters = engine.INITIAL_DAILY_USAGE
    engine.last_timestamp = None
    return {"ok": True, "message": "Demo state reset."}
