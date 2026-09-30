// src/components/ReminderLog.tsx
import React, { useEffect, useState } from "react";
import { fetchReminders } from "../api/reminder";

interface Reminder {
  id: string;
  name: string;
  next_run_time: string;
  args: string[];
}

const ReminderLog = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReminders()
      .then(setReminders)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="bg-white p-4 rounded-xl shadow-md mt-6">
      <h2 className="text-xl font-semibold mb-4">⏰ Upcoming Reminders</h2>
      {error && <p className="text-red-500">{error}</p>}
      {reminders.length === 0 ? (
        <p className="text-gray-500">No reminders scheduled.</p>
      ) : (
        <ul className="space-y-3">
          {reminders.map((r) => (
            <li key={r.id} className="border p-3 rounded-lg">
              <div><strong>Time:</strong> {new Date(r.next_run_time).toLocaleString()}</div>
              <div><strong>To:</strong> {r.args?.[0]}</div>
              <div><strong>Body:</strong> {r.args?.[2]}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ReminderLog;
