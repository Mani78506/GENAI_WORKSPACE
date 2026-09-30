import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Clock,
  ArrowLeft,
  Sun,
  Moon,
  BellRing,
  RefreshCw,
  CalendarClock,
  Mail,
  CheckCircle2,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setPageMeta } from '@/lib/page-meta';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Reminder {
  id: string;
  name: string;
  next_run_time: string | null;
  args: string[];
}

interface TaskLog {
  timestamp: string;
  task_type: string;
  user_input: string;
  result: string;
}

function timeUntil(iso: string | null): string {
  if (!iso) return 'unscheduled';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'due now';
  const m = Math.floor(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

const Reminders = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('GenAiWorkspaceTheme') || 'dark');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    setPageMeta('Reminders · Scheduled tasks', ['#8b5cf6', '#9333ea'], 'cpu');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('GenAiWorkspaceTheme', next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, l] = await Promise.all([
        fetch(`${API_BASE_URL}/reminders`).then(res => { if (!res.ok) throw new Error('Failed to fetch reminders'); return res.json(); }),
        fetch(`${API_BASE_URL}/api/agent/tasks/logs`).then(res => res.ok ? res.json() : { logs: [] }).catch(() => ({ logs: [] })),
      ]);
      setReminders(r);
      setLogs([...(l.logs || [])].sort((a: TaskLog, b: TaskLog) => +new Date(b.timestamp) - +new Date(a.timestamp)).slice(0, 10));
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        {/* Aurora */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="animate-aurora absolute -top-40 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 opacity-10 blur-3xl" />
          <div className="animate-aurora absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10 blur-3xl" style={{ animationDelay: '-6s' }} />
        </div>

        {/* Nav */}
        <header className="relative z-10 mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/agent" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src="/brand/ai-chip.png" alt="AI" className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <div className="text-sm font-bold tracking-tight">Reminders</div>
              <div className="text-xs text-muted-foreground">AI Agent schedules</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button onClick={load} variant="ghost" size="sm" disabled={loading} className="h-8 px-2 text-xs text-muted-foreground">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={toggleTheme} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/agent"><ArrowLeft className="mr-1.5 h-4 w-4" />AI Agent</Link>
            </Button>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-4xl px-6 pb-16">
          {/* Header */}
          <div className="animate-fade-up mb-8">
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
                <BellRing className="h-5 w-5 text-white" />
              </div>
              Reminders
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Scheduled reminders created by AI Agent — emails are sent automatically at the scheduled time.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error} — is the backend running on :8000?
            </div>
          )}

          {/* Upcoming */}
          <section className="animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                Upcoming
              </h2>
              <span className="text-xs text-muted-foreground">
                {reminders.length} scheduled · updated {lastRefresh.toLocaleTimeString()}
              </span>
            </div>

            {reminders.length === 0 && !loading ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Timer className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold">No reminders scheduled</h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Ask AI Agent to set one — e.g. <span className="rounded bg-muted px-1.5 py-0.5 font-mono">"Remind me to check reports at 5 PM"</span>
                </p>
                <Button asChild size="sm" className="mt-5 bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90">
                  <Link to="/agent">Open AI Agent</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {reminders.map((r, i) => (
                  <div
                    key={r.id}
                    className="animate-fade-up group flex items-start gap-4 rounded-xl border border-border bg-card/70 px-5 py-4 backdrop-blur-sm transition-all hover:border-foreground/20 hover:shadow-md"
                    style={{ animationDelay: `${150 + i * 80}ms` }}
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                      <BellRing className="h-5 w-5 text-violet-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.next_run_time ? new Date(r.next_run_time).toLocaleString() : 'unscheduled'}</span>
                        {r.args?.[0] && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.args[0]}</span>}
                      </div>
                      {r.args?.[2] && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80">{r.args[2]}</p>}
                    </div>
                    <span className="flex-shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-500">
                      {timeUntil(r.next_run_time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section className="animate-fade-up mt-10" style={{ animationDelay: '250ms' }}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Recent agent activity
            </h2>
            {logs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-6 text-center text-xs text-muted-foreground">
                No agent activity logged yet.
              </p>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{log.user_input}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">{log.task_type}</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default Reminders;
