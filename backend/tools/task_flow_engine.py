# backend/tools/task_flow_engine.py
from backend.tools.prompt_templates import prompt_templates
from backend.tools.calendar_tool import create_reminder
from backend.tools.email_tool import send_email_reply
from backend.tools.task_tools import summarize_text
from backend.tools.scheduling_tool import schedule_meeting
import json
from datetime import datetime

LOG_FILE = "agent_tasks_log.json"

def log_agent_task(task_type, user_input, result):
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "task_type": task_type,
        "user_input": user_input,
        "result": result
    }
    try:
        with open(LOG_FILE, "r") as f:
            logs = json.load(f)
    except FileNotFoundError:
        logs = []

    logs.append(log_entry)

    with open(LOG_FILE, "w") as f:
        json.dump(logs, f, indent=2)

def task_flow_engine(user_input):
    user_input = user_input.lower()

    if "remind me" in user_input or "reminder" in user_input:
        intent = "create_reminder"
        result = create_reminder(user_input)

    elif "reply to" in user_input or "send email" in user_input:
        intent = "send_email"
        result = send_email_reply(user_input)

    elif "summarize" in user_input or "give me a summary" in user_input:
        intent = "summarize_text"
        result = summarize_text(user_input)

    elif "schedule" in user_input and "meeting" in user_input:
        intent = "schedule_meeting"
        result = schedule_meeting(user_input)

    else:
        intent = "unknown"
        result = f"I'm not sure how to handle this request: {user_input}"

    log_agent_task(intent, user_input, result)
    return result
