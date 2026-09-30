// src/api/reminder.ts
export async function fetchReminders() {
  const response = await fetch("http://localhost:8000/reminders");
  if (!response.ok) throw new Error("Failed to fetch reminders");
  return response.json();
}
