import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  Crown,
  LogOut,
  Lightbulb,
  Search,
  Cpu,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { AuthModal } from '@/components/AuthModal';
import { setPageMeta } from '@/lib/page-meta';
import { getToken } from '@/api/auth';

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  plus: 'bg-blue-500/15 text-blue-500 border border-blue-500/30',
  pro: 'bg-violet-500/15 text-violet-500 border border-violet-500/30',
};

// The agent's three jobs — shown as capabilities, all routed by one brain
const CAPABILITIES = [
  { icon: Lightbulb, label: 'Answers', desc: 'Docs + citations', color: 'from-blue-500 to-indigo-600', text: 'text-blue-500' },
  { icon: Search, label: 'Searches', desc: 'Semantic, all docs', color: 'from-emerald-500 to-teal-600', text: 'text-emerald-500' },
  { icon: Cpu, label: 'Acts', desc: 'Todos, emails, meetings', color: 'from-violet-500 to-purple-600', text: 'text-violet-500' },
];

// Self-playing demo — three scenarios the agent handles automatically
interface DemoStep { user: string; engine: 'assistant' | 'search' | 'agent'; reply: string; meta?: string }
const DEMO: DemoStep[] = [
  {
    user: 'What is the leave policy at TechNova?',
    engine: 'assistant',
    reply: 'TechNova provides 20 days of paid annual leave, plus 8 public holidays. Unused leave carries over up to 5 days.',
    meta: 'TechNova_Policies.docx',
  },
  {
    user: 'Find the password requirements',
    engine: 'search',
    reply: 'Minimum 12 characters with upper, lower, digit & symbol. Rotated every 90 days.',
    meta: 'Security_Policy.pdf',
  },
  {
    user: 'Remind me to review the report tomorrow at 10 AM',
    engine: 'agent',
    reply: 'Done — reminder scheduled for tomorrow, 10:00 AM. You\'ll get an email.',
    meta: 'reminder created',
  },
];

const ENGINE_META: Record<DemoStep['engine'], { label: string; icon: any; cls: string }> = {
  assistant: { label: 'AI Assistant', icon: Lightbulb, cls: 'bg-blue-500/15 text-blue-500' },
  search: { label: 'AI Search', icon: Search, cls: 'bg-emerald-500/15 text-emerald-500' },
  agent: { label: 'AI Agent', icon: Cpu, cls: 'bg-violet-500/15 text-violet-500' },
};

// phases: typingUser → routing → thinking → typingReply → hold → reset
const Landing = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('GenAiWorkspaceTheme') || 'dark');
  const { user, setAuthModalOpen, logout } = useAuth();
  // Carry the session into the new /app tab so signed-in users aren't asked again
  const appHref = user ? `/app?at=${getToken()}` : '/app';

  // --- demo state machine ---
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'routing' | 'thinking' | 'reply' | 'hold'>('typing');
  const [typedUser, setTypedUser] = useState('');
  const [typedReply, setTypedReply] = useState('');
  const step = DEMO[stepIdx];
  const timersRef = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)); };

  useEffect(() => {
    setPageMeta('GenAI Workspace · Your AI agent');
  }, []);

  useEffect(() => {
    const s = DEMO[stepIdx];
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setTypedUser(''); setTypedReply('');
    setPhase('typing');

    // type the user's message
    for (let i = 1; i <= s.user.length; i++) {
      const idx = i;
      later(() => setTypedUser(s.user.slice(0, idx)), i * 28);
    }
    const t0 = s.user.length * 28;
    later(() => setPhase('routing'), t0 + 500);      // routing flash
    later(() => setPhase('thinking'), t0 + 1400);    // thinking dots
    later(() => setPhase('reply'), t0 + 2600);
    // type the reply
    for (let i = 1; i <= s.reply.length; i++) {
      const idx = i;
      later(() => setTypedReply(s.reply.slice(0, idx)), t0 + 2600 + i * 16);
    }
    const tEnd = t0 + 2600 + s.reply.length * 16;
    later(() => setPhase('hold'), tEnd + 400);       // hold completed state
    later(() => setStepIdx(i => (i + 1) % DEMO.length), tEnd + 3200); // next scenario
    return () => timersRef.current.forEach(clearTimeout);
  }, [stepIdx]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('GenAiWorkspaceTheme', next);
  };

  const EngineBadge = ENGINE_META[step.engine];

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {/* Aurora background */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="animate-aurora absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-15 blur-3xl" />
          <div className="animate-aurora absolute top-1/3 -right-32 h-80 w-80 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 opacity-10 blur-3xl" style={{ animationDelay: '-5s' }} />
          <div className="animate-aurora absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 opacity-10 blur-3xl" style={{ animationDelay: '-9s' }} />
        </div>

        {/* Nav */}
        <header className="relative z-10 mx-auto flex w-full max-w-6xl flex-shrink-0 items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <img src="/brand/ai-chip.png" alt="GenAI Workspace" className="animate-pulse-glow h-9 w-9 rounded-xl shadow-md" />
            <span className="text-sm font-bold tracking-tight">GenAI Workspace</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/pricing">Pricing</Link>
            </Button>
            <Button onClick={toggleTheme} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pl-1 pr-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <span className="hidden max-w-[120px] truncate text-xs sm:block">{user.name || user.email}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PLAN_BADGE[user.plan] || PLAN_BADGE.free}`}>
                    {user.plan === 'pro' && <Crown className="mr-0.5 inline h-2.5 w-2.5" />}{user.plan}
                  </span>
                </div>
                <Button asChild size="sm">
                  <Link to={appHref} target="_blank" rel="noopener noreferrer">Open app <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                </Button>
                <Button onClick={logout} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" title="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Button onClick={() => setAuthModalOpen(true)} variant="ghost" size="sm" className="text-muted-foreground">
                  Sign in
                </Button>
                <Button asChild size="sm">
                  <Link to={appHref} target="_blank" rel="noopener noreferrer">Open app <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Hero + live demo — split, fills viewport */}
        <main className="relative z-10 mx-auto flex w-full max-w-6xl min-h-0 flex-1 items-center gap-10 px-6 pb-6 max-lg:flex-col max-lg:justify-center">
          {/* Left — what the agent is */}
          <section className="flex-1 max-lg:text-center">
            <div className="animate-fade-up mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              One agent · powered by Gemini + your documents
            </div>
            <h1 className="animate-fade-up text-3xl font-bold leading-tight tracking-tight md:text-5xl" style={{ animationDelay: '80ms' }}>
              Your{' '}
              <span className="animate-gradient-pan bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 bg-clip-text text-transparent">
                AI workspace agent.
              </span>
            </h1>
            <p className="animate-fade-up mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base max-lg:mx-auto" style={{ animationDelay: '160ms' }}>
              Ask it questions, have it search your files, or tell it to act — reminders, emails, meetings, todos.
              It picks the right engine for every request, automatically.
            </p>

            {/* Capability pills */}
            <div className="animate-fade-up mt-6 flex flex-wrap gap-2.5 max-lg:justify-center" style={{ animationDelay: '240ms' }}>
              {CAPABILITIES.map(c => (
                <div key={c.label} className="flex items-center gap-2.5 rounded-xl border border-border bg-card/70 px-3.5 py-2 backdrop-blur-sm">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${c.color}`}>
                    <c.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold">{c.label}</div>
                    <div className="text-[10px] text-muted-foreground">{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="animate-fade-up mt-7 flex gap-3 max-lg:justify-center" style={{ animationDelay: '320ms' }}>
              <Button asChild size="lg" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90">
                <Link to={appHref} target="_blank" rel="noopener noreferrer">
                  Start chatting <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/pricing">See plans</Link>
              </Button>
            </div>
            <p className="animate-fade-up mt-3 text-xs text-muted-foreground" style={{ animationDelay: '380ms' }}>
              No account needed — try {2} free messages as a guest.
            </p>
          </section>

          {/* Right — self-playing demo of the unified agent */}
          <section className="animate-fade-up w-full max-w-md flex-1 max-lg:max-w-lg" style={{ animationDelay: '300ms' }}>
            <div className="overflow-hidden rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur-md">
              {/* window chrome */}
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                </div>
                <span className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <img src="/brand/ai-chip.png" alt="" className="h-4 w-4 rounded" /> GenAI Workspace
                </span>
                <span className="w-10" />
              </div>

              {/* demo chat */}
              <div className="flex h-64 flex-col gap-3 overflow-hidden p-4">
                {/* user bubble — types out */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-3.5 py-2 text-sm">
                    {typedUser}
                    {phase === 'typing' && <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-foreground/60 align-middle" />}
                  </div>
                </div>

                {/* routing indicator */}
                {(phase === 'routing' || phase === 'thinking') && (
                  <div className="animate-fade-up flex items-center gap-2 text-xs text-muted-foreground">
                    <EngineBadge.icon className="h-3.5 w-3.5" />
                    {phase === 'routing' ? (
                      <span>Routing to <span className="font-medium text-foreground">{ENGINE_META[step.engine].label}</span>…</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        Working
                        <span className="h-1 w-1 animate-bounce-dot rounded-full bg-muted-foreground" />
                        <span className="h-1 w-1 animate-bounce-dot rounded-full bg-muted-foreground" style={{ animationDelay: '0.15s' }} />
                        <span className="h-1 w-1 animate-bounce-dot rounded-full bg-muted-foreground" style={{ animationDelay: '0.3s' }} />
                      </span>
                    )}
                  </div>
                )}

                {/* agent reply — types out */}
                {(phase === 'reply' || phase === 'hold') && (
                  <div className="animate-fade-up flex gap-2.5">
                    <img src="/brand/ai-chip.png" alt="AI" className="h-7 w-7 flex-shrink-0 rounded-lg" />
                    <div className="min-w-0 max-w-[85%]">
                      <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2 text-sm leading-relaxed">
                        {typedReply}
                        {phase === 'reply' && <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse rounded-full bg-blue-500 align-middle" />}
                      </div>
                      {phase === 'hold' && (
                        <div className="animate-fade-up mt-1.5 flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ENGINE_META[step.engine].cls}`}>
                            <EngineBadge.icon className="h-2.5 w-2.5" /> via {ENGINE_META[step.engine].label}
                          </span>
                          {step.meta && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {step.engine === 'agent' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
                              {step.meta}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* demo composer (decorative) */}
              <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                <div className="h-9 flex-1 rounded-full border border-border bg-muted/50 px-4 text-xs leading-9 text-muted-foreground/60">
                  Ask it anything…
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-600">
                  <ArrowRight className="h-4 w-4 -rotate-90 text-white" />
                </div>
              </div>
            </div>

            {/* scenario dots */}
            <div className="mt-4 flex justify-center gap-1.5">
              {DEMO.map((s, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${i === stepIdx ? 'w-6 bg-foreground/60' : 'w-1.5 bg-foreground/20'}`}
                />
              ))}
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="relative z-10 flex-shrink-0 border-t border-border/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-xs text-muted-foreground">
            <span>GenAI Workspace — one agent, three engines</span>
            <span className="hidden gap-4 md:flex">
              <span>Document RAG</span>·<span>Semantic search</span>·<span>Task automation</span>·<span>Scheduling</span>
            </span>
          </div>
        </footer>
      </div>

      <AuthModal />
    </div>
  );
};

export default Landing;
