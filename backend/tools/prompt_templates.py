# backend/tools/prompt_templates.py
# ...existing code...

SUMMARY_PROMPT = """
Summarize the following meeting transcript into clear bullet points:

Transcript:
{transcript}
"""

REMINDER_PROMPT = """
Create a reminder task for the following request:

"{user_request}"
"""

EMAIL_REPLY_PROMPT = """
Generate a polite and helpful reply to this email:

"{email_content}"
"""

prompt_templates = {
    "summary": SUMMARY_PROMPT,
    "reminder": REMINDER_PROMPT,
    "email_reply": EMAIL_REPLY_PROMPT,
}
