# =======================
# 1. calendar_tool.py (REAL Google Calendar API)
# =======================
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime, timedelta
import os
import re
import dateparser

SCOPES = ['https://www.googleapis.com/auth/calendar']
SERVICE_ACCOUNT_FILE = r'C:\Users\Mani\OneDrive\Documents\ai_search_assistant\backend\credentials\service_account.json'
CALENDAR_ID = 'mamidalamokshithreddy@gmail.com'  # Replace with your Calendar ID if needed

credentials = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE, scopes=SCOPES
)
service = build('calendar', 'v3', credentials=credentials)

import dateparser

def create_reminder(user_request: str) -> str:
    # Simple implementation: just echo the request for now
    # You can expand this to actually create a calendar event if needed
    return f"Reminder created for: {user_request}"

def schedule_meeting_from_prompt(prompt: str) -> str:
    print(f"Prompt received: {prompt}")
    datetime_obj = dateparser.parse(prompt)
    print(f"Parsed datetime: {datetime_obj}")

    if not datetime_obj:
        return "I couldn't understand the date/time in your request."

    # Simulate scheduling logic here
    return f"Meeting scheduled for {datetime_obj.isoformat()}"

def parse_meeting_details(query: str):
    # Naive parsing – you can enhance with NLP later
    subject_match = re.search(r"(called|titled|named)\s+['\"]?([^'\"]+)['\"]?", query)
    date_match = re.search(r"on\s+(\w+\s+\d{1,2}(st|nd|rd|th)?)", query)
    time_match = re.search(r"at\s+(\d{1,2}(?::\d{2})?\s*(AM|PM|am|pm)?)", query)
    duration_match = re.search(r"for\s+(\d+\s*(minutes?|hours?))", query)

    subject = subject_match.group(2) if subject_match else "Untitled Meeting"
    date_str = date_match.group(1) if date_match else datetime.now().strftime("%B %d")
    time = time_match.group(1) if time_match else "10:00 AM"
    duration = duration_match.group(1) if duration_match else "30 minutes"

    # Optional: Convert date to standard format
    try:
        date_obj = datetime.strptime(date_str, "%B %d")
        date = date_obj.strftime("2025-%m-%d")  # Assume year
    except Exception:
        date = "2025-06-01"

    return subject, date, time, duration

def schedule_meeting(subject: str, date: str, time: str, duration: str) -> str:
    # Dummy implementation for scheduling a meeting
    # Replace with actual Google Calendar API call as needed
    return f"✅ Meeting '{subject}' scheduled on {date} at {time} for {duration}."

def schedule_meeting_wrapper(query: str) -> str:
    try:
        subject, date, time, duration = parse_meeting_details(query)
        return schedule_meeting(subject, date, time, duration)
    except Exception as e:
        return f"❌ Failed to parse meeting: {str(e)}"