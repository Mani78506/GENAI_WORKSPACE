import re
import dateparser
from .calendar_tool import schedule_meeting


def schedule_meeting_from_prompt(prompt: str) -> str:
    # 1. Extract title
    title_match = re.search(r"(titled|about|called)\s+(.*?)(\s+(on|at|for|in|tomorrow|today)\b)", prompt, re.IGNORECASE)
    subject = title_match.group(2).strip() if title_match else "Untitled Meeting"

    # 2. Extract date/time segment separately
    datetime_text_match = re.search(r"(on|at|in|by|for)?\s*(.*?)(\s+for\s+\d+\s*(minutes|minute|min))", prompt, re.IGNORECASE)
    datetime_text = datetime_text_match.group(2) if datetime_text_match else prompt

    datetime_obj = dateparser.parse(datetime_text)
    if not datetime_obj:
        return "❌ Could not understand the date/time in your request."

    date_str = datetime_obj.strftime("%Y-%m-%d")
    time_str = datetime_obj.strftime("%H:%M")

    # 3. Extract duration
    duration_match = re.search(r'(\d+)\s*(minutes|minute|min)', prompt, re.IGNORECASE)
    duration = int(duration_match.group(1)) if duration_match else 30

    # 4. Schedule meeting
    try:
        return schedule_meeting(subject, date_str, time_str, duration)
    except Exception as e:
        return f"❌ Failed to schedule meeting: {str(e)}"
