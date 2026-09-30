from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import uuid

scheduler = BackgroundScheduler()
scheduler.start()

import requests

def schedule_reminder(agent, reminder_text: str, run_at: datetime):
    job_id = str(uuid.uuid4())

    def reminder_job():
        import os

        WEBHOOK_URL = os.getenv("WEBHOOK_URL")
        if WEBHOOK_URL:
            requests.post(WEBHOOK_URL, json={"reminder": reminder_text})

            print(f"[INFO] Triggering reminder: {reminder_text}")
            email_tool = next((t for t in agent.tools if t.name == "send_email"), None)
            if email_tool:
                email_tool.run({
                    "subject": "Reminder",
                    "body": f"Reminder: {reminder_text}",
                    "to_email": "mamidalamokshithreddy@gmail.com"
                })

    scheduler.add_job(reminder_job, trigger='date', run_date=run_at, id=job_id)
    print(f"[INFO] Scheduled reminder: {reminder_text} at {run_at}")
    return job_id
