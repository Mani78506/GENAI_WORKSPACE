from typing import Optional
import smtplib
from email.mime.text import MIMEText
from pydantic import BaseModel
from langchain.tools import tool
import os
from dotenv import load_dotenv
import re 

load_dotenv()

EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")


class EmailInput(BaseModel):
    to_email: str
    subject: Optional[str] = None
    body: Optional[str] = None

@tool("send_email", args_schema=EmailInput, return_direct=True)
def send_email(input_data) -> str:
    """Send an email to a user with a subject and body."""
    # If input is a string, parse it for email, subject, and body
    if isinstance(input_data, str):
        # Simple regex-based parsing
        email_match = re.search(r"to ([\w\.-]+@[\w\.-]+)", input_data)
        subject_match = re.search(r"subject ['\"](.+?)['\"]", input_data)
        body_match = re.search(r"body ['\"](.+?)['\"]", input_data)
        to_email = email_match.group(1) if email_match else ""
        subject = subject_match.group(1) if subject_match else "No Subject"
        body = body_match.group(1) if body_match else "No Content"
        input_data = EmailInput(to_email=to_email, subject=subject, body=body)
    elif isinstance(input_data, dict):
        input_data = EmailInput(**input_data)

    subject = input_data.subject or "No Subject"
    body = input_data.body or "No Content"
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = EMAIL_ADDRESS
    msg['To'] = input_data.to_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(msg)
        return f"Email sent successfully to {input_data.to_email}"
    except Exception as e:
        return f"Failed to send email: {str(e)}"

@tool("send_email_reply", args_schema=EmailInput, return_direct=True)
def send_email_reply(input_data) -> str:
    """Send a reply email to a user."""
    if isinstance(input_data, str):
        # Parse string for email, subject, and body
        email_match = re.search(r"to ([\w\.-]+@[\w\.-]+)", input_data)
        subject_match = re.search(r"subject ['\"](.+?)['\"]", input_data)
        body_match = re.search(r"body ['\"](.+?)['\"]", input_data)
        to_email = email_match.group(1) if email_match else ""
        subject = subject_match.group(1) if subject_match else "No Subject"
        body = body_match.group(1) if body_match else "No Content"
        input_data = EmailInput(to_email=to_email, subject=subject, body=body)
    elif isinstance(input_data, dict):
        input_data = EmailInput(**input_data)

    subject = "RE: " + (input_data.subject or "No Subject")
    body = "RE: " + (input_data.body or "No Content")
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = EMAIL_ADDRESS
    msg['To'] = input_data.to_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            server.send_message(msg)
        return f"Reply email sent successfully to {input_data.to_email}"
    except Exception as e:
        return f"Failed to send reply email: {str(e)}"