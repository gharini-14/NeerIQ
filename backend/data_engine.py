import random
import statistics
from datetime import datetime, date

# =========================================================
# NeerIQ CONFIGURATION
# =========================================================

TANK_CAPACITY_LITERS = 4000
INITIAL_TANK_LEVEL = 70.0
INITIAL_DAILY_USAGE = 3200.0
MAX_HISTORY = 100
WATER_RATE_PER_1000L = 25.0

# =========================================================
# SYSTEM STATE
# =========================================================

water_history = []

current_tank_liters = (
    TANK_CAPACITY_LITERS * INITIAL_TANK_LEVEL / 100
)

daily_usage_liters = INITIAL_DAILY_USAGE
last_timestamp = None
last_date = date.today()

# =========================================================
# ZONE CONFIGURATION
# =========================================================

zones = {
    "Zone A": {
        "type": "Residential",
        "base_flow": 7.0,
    },
    "Zone B": {
        "type": "Residential",
        "base_flow": 5.5,
    },
    "Zone C": {
        "type": "Utility",
        "base_flow": 4.0,
    },
    "Zone D": {
        "type": "Garden",
        "base_flow": 3.0,
    },
}

# =========================================================
# TIME-BASED DEMAND
# =========================================================

def get_time_demand():
    hour = datetime.now().hour

    if 0 <= hour < 6:
        return {
            "flow_min": 4.0,
            "flow_max": 9.0,
            "demand": "LOW",
        }

    if 6 <= hour < 10:
        return {
            "flow_min": 16.0,
            "flow_max": 25.0,
            "demand": "HIGH",
        }

    if 10 <= hour < 17:
        return {
            "flow_min": 10.0,
            "flow_max": 18.0,
            "demand": "NORMAL",
        }

    if 17 <= hour < 22:
        return {
            "flow_min": 17.0,
            "flow_max": 27.0,
            "demand": "HIGH",
        }

    return {
        "flow_min": 6.0,
        "flow_max": 12.0,
        "demand": "LOW",
    }


# =========================================================
# DAILY RESET
# =========================================================

def check_new_day():
    global daily_usage_liters
    global last_date

    today = date.today()

    if today != last_date:
        daily_usage_liters = 0.0
        last_date = today


# =========================================================
# ANOMALY DETECTION
# =========================================================

def detect_anomaly(current_flow):
    if len(water_history) < 5:
        return {
            "detected": False,
            "severity": "NORMAL",
            "score": 0,
            "average_flow": current_flow,
            "percentage_difference": 0,
            "message": (
                "Collecting historical data to establish "
                "the normal flow pattern."
            ),
        }

    previous_flows = [
        float(item["flow_rate"])
        for item in water_history[-20:]
    ]

    average_flow = statistics.mean(previous_flows)

    standard_deviation = (
        statistics.stdev(previous_flows)
        if len(previous_flows) > 1
        else 1
    )

    standard_deviation = max(standard_deviation, 1)

    deviation = current_flow - average_flow
    z_score = deviation / standard_deviation

    percentage_difference = (
        deviation / max(average_flow, 1)
    ) * 100

    anomaly_score = min(
        100,
        max(0, abs(z_score) * 20),
    )

    if z_score >= 3:
        severity = "CRITICAL"
        detected = True
        message = (
            "Critical water flow anomaly detected. "
            "Possible leakage or abnormal consumption."
        )
    elif z_score >= 2:
        severity = "WARNING"
        detected = True
        message = (
            "Water flow is significantly higher "
            "than the recent historical pattern."
        )
    else:
        severity = "NORMAL"
        detected = False
        message = (
            "Water flow is within the normal "
            "historical pattern."
        )

    return {
        "detected": detected,
        "severity": severity,
        "score": round(anomaly_score),
        "average_flow": round(average_flow, 2),
        "percentage_difference": round(
            percentage_difference, 1
        ),
        "message": message,
    }


# =========================================================
# LEAKAGE DETECTION
# =========================================================

def detect_leakage(current_flow, anomaly):
    if len(water_history) < 5:
        return {
            "detected": False,
            "confidence": 0,
            "estimated_loss": 0,
            "message": "Not enough data for leakage analysis.",
        }

    recent = water_history[-5:]

    continuous_flow = all(
        float(item["flow_rate"]) > 12
        for item in recent
    )

    average_flow = float(
        anomaly.get("average_flow", current_flow)
    )

    high_flow = (
        current_flow > max(average_flow * 1.35, 18)
    )

    hour = datetime.now().hour
    low_demand_period = hour >= 22 or hour < 6

    score = 0

    if continuous_flow:
        score += 35

    if high_flow:
        score += 35

    if low_demand_period:
        score += 20

    if anomaly.get("detected", False):
        score += 10

    score = min(score, 100)
    detected = score >= 65

    estimated_loss = 0

    if detected:
        estimated_loss = round(
            max(current_flow - average_flow, 0) * 5,
            1,
        )

    if detected:
        message = (
            "Possible water leakage detected. "
            "Continuous abnormal flow is being observed."
        )
    else:
        message = "No significant leakage pattern detected."

    return {
        "detected": detected,
        "confidence": score,
        "estimated_loss": estimated_loss,
        "message": message,
    }


# =========================================================
# NeerIQ WATER HEALTH SCORE
# =========================================================

def calculate_water_score(anomaly, leakage):
    score = 100

    score -= anomaly.get("score", 0) * 0.30
    score -= leakage.get("confidence", 0) * 0.35

    tank_percentage = (
        current_tank_liters / TANK_CAPACITY_LITERS
    ) * 100

    if tank_percentage < 20:
        score -= 15
    elif tank_percentage < 30:
        score -= 8

    score = max(0, min(100, round(score)))

    if score >= 90:
        rating = "EXCELLENT"
    elif score >= 75:
        rating = "GOOD"
    elif score >= 50:
        rating = "WARNING"
    else:
        rating = "CRITICAL"

    return {
        "score": score,
        "rating": rating,
    }


# =========================================================
# ZONE ANALYTICS
# =========================================================

def generate_zone_data():
    result = []

    total_base = sum(
        item["base_flow"]
        for item in zones.values()
    )

    current_flow = (
        water_history[-1]["flow_rate"]
        if water_history
        else 18
    )

    for name, config in zones.items():
        share = config["base_flow"] / total_base

        zone_flow = round(
            current_flow
            * share
            * random.uniform(0.85, 1.15),
            1,
        )

        zone_usage = round(
            zone_flow * 5 / 60,
            2,
        )

        status = "NORMAL"

        if zone_flow > config["base_flow"] * 1.7:
            status = "WARNING"

        result.append({
            "name": name,
            "type": config["type"],
            "flow_rate": zone_flow,
            "usage": zone_usage,
            "status": status,
            "base_flow": config["base_flow"],
        })

    return result


# =========================================================
# WATER COST
# =========================================================

def calculate_water_cost():
    today_cost = (
        daily_usage_liters / 1000
    ) * WATER_RATE_PER_1000L

    monthly_usage = daily_usage_liters * 30

    monthly_cost = (
        monthly_usage / 1000
    ) * WATER_RATE_PER_1000L

    potential_saving = monthly_cost * 0.15

    return {
        "rate_per_1000_liters": WATER_RATE_PER_1000L,
        "today_usage": round(daily_usage_liters),
        "today_cost": round(today_cost, 2),
        "estimated_monthly_usage": round(monthly_usage),
        "estimated_monthly_cost": round(monthly_cost, 2),
        "potential_15_percent_saving": round(
            potential_saving, 2
        ),
    }


# =========================================================
# SMART NOTIFICATIONS
# =========================================================

def generate_notifications(anomaly, leakage):
    notifications = []

    tank_percentage = (
        current_tank_liters / TANK_CAPACITY_LITERS
    ) * 100

    if leakage.get("detected", False):
        notifications.append({
            "type": "CRITICAL",
            "title": "Possible Water Leakage",
            "message": leakage.get("message", ""),
            "priority": 1,
        })

    if anomaly.get("detected", False):
        notifications.append({
            "type": "WARNING",
            "title": "Abnormal Water Flow",
            "message": anomaly.get("message", ""),
            "priority": 2,
        })

    if tank_percentage < 25:
        notifications.append({
            "type": "WARNING",
            "title": "Low Tank Level",
            "message": "Main tank level is below 25%.",
            "priority": 3,
        })

    if daily_usage_liters > 5000:
        notifications.append({
            "type": "INFO",
            "title": "High Daily Consumption",
            "message": (
                "Today's water usage is above 5,000 L."
            ),
            "priority": 4,
        })

    if not notifications:
        notifications.append({
            "type": "SUCCESS",
            "title": "System Healthy",
            "message": "No critical water events detected.",
            "priority": 5,
        })

    return sorted(
        notifications,
        key=lambda item: item["priority"],
    )


# =========================================================
# GENERATE WATER READING
# =========================================================

def generate_water_data():
    global current_tank_liters
    global daily_usage_liters
    global last_timestamp

    check_new_day()

    now = datetime.now()

    if last_timestamp is None:
        elapsed_seconds = 5
    else:
        elapsed_seconds = (
            now - last_timestamp
        ).total_seconds()

    elapsed_seconds = max(
        1,
        min(elapsed_seconds, 30),
    )

    last_timestamp = now

    demand = get_time_demand()

    flow_rate = random.uniform(
        demand["flow_min"],
        demand["flow_max"],
    )

    abnormal_event = random.random() < 0.06

    if abnormal_event:
        flow_rate *= random.uniform(1.5, 2.0)

    flow_rate = round(flow_rate, 1)

    consumed_liters = (
        flow_rate * elapsed_seconds / 60
    )

    daily_usage_liters += consumed_liters
    daily_usage_liters = round(
        daily_usage_liters,
        1,
    )

    tank_percentage = (
        current_tank_liters / TANK_CAPACITY_LITERS
    ) * 100

    pump_status = "OFF"
    refill_liters = 0

    if tank_percentage < 30:
        pump_status = "ON"
        refill_liters = 8

    current_tank_liters += (
        refill_liters - consumed_liters
    )

    current_tank_liters = max(
        0,
        min(
            current_tank_liters,
            TANK_CAPACITY_LITERS,
        ),
    )

    tank_level = round(
        (
            current_tank_liters
            / TANK_CAPACITY_LITERS
        ) * 100,
        1,
    )

    if flow_rate > 30:
        pressure = "HIGH"
    elif flow_rate < 5:
        pressure = "LOW"
    else:
        pressure = "NORMAL"

    anomaly = detect_anomaly(flow_rate)

    leakage = detect_leakage(
        flow_rate,
        anomaly,
    )

    if leakage["detected"]:
        system_status = "CRITICAL"
    elif anomaly["detected"]:
        system_status = "WARNING"
    else:
        system_status = "HEALTHY"

    reading = {
        "timestamp": now.isoformat(),
        "tank_level": tank_level,
        "tank_volume": round(
            current_tank_liters,
            1,
        ),
        "flow_rate": flow_rate,
        "daily_usage": round(daily_usage_liters),
        "instant_consumption": round(
            consumed_liters,
            2,
        ),
        "pump_status": pump_status,
        "pressure": pressure,
        "demand_level": demand["demand"],
        "system_status": system_status,
        "anomaly_detected": anomaly["detected"],
        "anomaly_severity": anomaly["severity"],
        "anomaly_score": anomaly["score"],
        "average_flow": anomaly["average_flow"],
        "flow_difference_percent": (
            anomaly["percentage_difference"]
        ),
        "anomaly_message": anomaly["message"],
        "leakage_detected": leakage["detected"],
        "leakage_confidence": leakage["confidence"],
        "estimated_leakage": leakage["estimated_loss"],
    }

    water_history.append(reading)

    if len(water_history) > MAX_HISTORY:
        water_history.pop(0)

    return reading


# =========================================================
# HISTORY
# =========================================================

def get_water_history():
    return water_history


# =========================================================
# LATEST
# =========================================================

def get_latest_reading():
    if not water_history:
        return generate_water_data()

    return water_history[-1]


# =========================================================
# FULL NeerIQ ANALYTICS
# =========================================================

def get_analytics():
    latest = get_latest_reading()

    anomaly = {
        "detected": latest["anomaly_detected"],
        "score": latest["anomaly_score"],
        "severity": latest["anomaly_severity"],
        "average_flow": latest["average_flow"],
        "percentage_difference": (
            latest["flow_difference_percent"]
        ),
        "message": latest.get(
            "anomaly_message",
            "",
        ),
    }

    leakage = {
        "detected": latest["leakage_detected"],
        "confidence": latest["leakage_confidence"],
        "estimated_loss": latest["estimated_leakage"],
        "message": (
            "Possible water leakage detected."
            if latest["leakage_detected"]
            else "No significant leakage pattern detected."
        ),
    }

    score = calculate_water_score(
        anomaly,
        leakage,
    )

    return {
        "water_score": score,
        "leakage": leakage,
        "zones": generate_zone_data(),
        "cost": calculate_water_cost(),
        "notifications": generate_notifications(
            anomaly,
            leakage,
        ),
        "usage": {
            "today": round(daily_usage_liters),
            "weekly": round(daily_usage_liters * 7 * random.uniform(0.9, 1.1)),
            "monthly": round(daily_usage_liters * 30 * random.uniform(0.9, 1.1)),
            "tank_remaining": round(
                current_tank_liters,
                1,
            ),
            "tank_capacity": TANK_CAPACITY_LITERS,
        },
    }


# =========================================================
# NeerIQ V2.8 — PREDICTIVE INTELLIGENCE
# =========================================================

def get_zone_insight():
    zone_data = generate_zone_data()

    if not zone_data:
        return {
            "available": False,
            "message": "Zone data unavailable.",
        }

    highest_zone = max(
        zone_data,
        key=lambda zone: float(
            zone.get("flow_rate", 0)
        ),
    )

    base_flow = float(
        highest_zone.get("base_flow", 1)
    )

    current_flow = float(
        highest_zone.get("flow_rate", 0)
    )

    deviation = (
        ((current_flow - base_flow) / base_flow) * 100
        if base_flow > 0
        else 0
    )

    return {
        "available": True,
        "zone": highest_zone.get("name"),
        "type": highest_zone.get("type"),
        "flow_rate": round(current_flow, 2),
        "base_flow": round(base_flow, 2),
        "deviation_percent": round(
            deviation,
            2,
        ),
        "status": highest_zone.get(
            "status",
            "NORMAL",
        ),
    }


# =========================================================
# AI INSIGHT
# =========================================================

def generate_ai_insight():
    """Explain current status, observed behaviour and recommended action; no demand forecasting."""
    latest = get_latest_reading()
    if not latest:
        return {"available": False, "message": "Waiting for water data."}
    anomaly = {
        "detected": latest.get("anomaly_detected", False),
        "severity": latest.get("anomaly_severity", "NORMAL"),
        "score": latest.get("anomaly_score", 0),
        "average_flow": latest.get("average_flow", latest.get("flow_rate", 0)),
        "percentage_difference": latest.get("flow_difference_percent", 0),
        "message": latest.get("anomaly_message", ""),
    }
    leakage = detect_leakage(float(latest.get("flow_rate", 0)), anomaly)
    zone = get_zone_insight()
    flow = float(latest.get("flow_rate", 0))
    average = float(anomaly.get("average_flow", flow))
    difference = float(anomaly.get("percentage_difference", 0))
    if leakage.get("detected"):
        situation, severity = "An unusual flow pattern may indicate water wastage.", "WARNING"
        why = "Sustained or unusually high simulated flow differs from the recent operating pattern. This is not proof of a physical leak."
        action = "Inspect the relevant zone and compare with a physical meter before concluding that a leak exists."
    elif anomaly.get("detected"):
        situation, severity = "Water flow differs from the recent baseline.", "WARNING"
        direction = "above" if difference >= 0 else "below"
        why = f"Current flow is {abs(round(difference, 1))}% {direction} the recent baseline of {average:.1f} L/min."
        action = "Check whether this change matches normal building activity."
    else:
        situation, severity = "No unusual flow pattern is currently flagged.", "NORMAL"
        why = f"Current simulated flow is {flow:.1f} L/min and is within the observed operating pattern."
        action = "Continue monitoring and follow the configured refill threshold."
    return {
        "available": True,
        "what": {"message": situation, "severity": severity},
        "why": {"message": why, "current_flow": round(flow, 2), "historical_average": round(average, 2), "difference_percent": round(difference, 2)},
        "zone": {"message": f"{zone.get('zone')} has the highest monitored flow." if zone.get("available") else None},
        "action": {"message": action},
        "leakage": leakage,
        "anomaly": anomaly,
    }


def ask_NeerIQ(question):
    q = question.lower().strip()
    latest = get_latest_reading()
    insight = generate_ai_insight()
    litres = float(latest.get("tank_volume", current_tank_liters))
    percent = (litres / TANK_CAPACITY_LITERS) * 100 if TANK_CAPACITY_LITERS else 0
    flow = float(latest.get("flow_rate", 0))
    if any(word in q for word in ["leak", "leakage", "waste", "unusual", "abnormal"]):
        if latest.get("leakage_detected") or latest.get("anomaly_detected"):
            answer = "NeerIQ flagged a possible unusual-flow pattern. This is not confirmation of a physical leak; inspect the zone and verify against a real meter."
        else:
            answer = "No unusual flow pattern is currently flagged in the simulated readings. This cannot rule out a real leak."
        intent = "anomaly"
    elif any(word in q for word in ["tank", "remaining", "water left", "level", "litre", "liter"]):
        answer = f"The simulated tank contains about {litres:,.0f} L ({percent:.1f}% of the {TANK_CAPACITY_LITERS:,.0f} L capacity)."
        if flow > 0.1:
            answer += f" At the current flow of {flow:.1f} L/min, simple division estimates {litres / flow:.0f} minutes remaining if flow stays constant. This is not an ML prediction."
        intent = "tank"
    elif any(word in q for word in ["usage", "consumption", "used", "today", "daily"]):
        answer = f"Today's estimated water usage in the simulation is {daily_usage_liters:,.0f} L."
        intent = "usage"
    elif "flow" in q:
        answer = f"Current simulated flow is {flow:.1f} L/min; the recent baseline is {float(latest.get('average_flow', flow)):.1f} L/min."
        intent = "flow"
    elif "cost" in q or "bill" in q:
        cost = calculate_water_cost()
        answer = f"Today's illustrative water cost is ₹{cost.get('today_cost', 0):.2f}; the estimated monthly cost is ₹{cost.get('estimated_monthly_cost', 0):.2f}."
        intent = "cost"
    elif any(word in q for word in ["refill", "threshold"]):
        threshold = 30
        answer = f"The default refill threshold is {threshold}%. Current tank level is {percent:.1f}%. " + ("Refill is recommended now." if percent <= threshold else "The tank is currently above the threshold.")
        intent = "refill"
    else:
        answer = f"{insight['what']['message']} {insight['why']['message']} Recommended action: {insight['action']['message']}"
        intent = "general"
    return {"answer": answer, "intent": intent, "source": "NeerIQ Local Intelligence"}
