import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { setPageMeta } from '@/lib/page-meta';
import {
  Bot,
  Check,
  ArrowLeft,
  Sun,
  Moon,
  Sparkles,
  Zap,
  Brain,
  Cpu,
  Crown,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { AuthModal } from '@/components/AuthModal';
import { authApi } from '@/api/auth';
import { toast } from '@/hooks/use-toast';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    icon: Sparkles,
    gradient: 'from-slate-500 to-slate-600',
    accent: 'text-slate-400',
    monthly: 0,
    yearly: 0,
    tagline: 'For trying things out',
    features: [
      'AI Assistant — 50 messages / day',
      'Document search across your files',
      'Cited sources on answers',
      '1 user',
      'Community support',
    ],
    cta: 'Current plan',
  },
  {
    id: 'plus',
    name: 'Plus',
    icon: Zap,
    gradient: 'from-blue-500 to-indigo-600',
    accent: 'text-blue-500',
    monthly: 9,
    yearly: 7,
    tagline: 'For everyday productivity',
    popular: true,
    features: [
      'All 3 products — Assistant, Search & Agent',
      '1,000 messages / day',
      'Reminders, todos & meeting scheduling',
      'Email sending via agent',
      'Chat history synced to your account',
      'Email support',
    ],
    cta: 'Upgrade to Plus',
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Crown,
    gradient: 'from-violet-500 to-purple-600',
    accent: 'text-violet-500',
    monthly: 29,
    yearly: 23,
    tagline: 'For teams & power users',
    features: [
      'Everything in Plus',
      'Unlimited messages',
      'Priority model speed',
      'API access',
      'Up to 10 team seats',
      'Priority support',
    ],
    cta: 'Go Pro',
  },
];

const Pricing = () => {
  const { user, setPlan, setAuthModalOpen } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('GenAiWorkspaceTheme') || 'dark');
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setPageMeta('Pricing · Free, Plus & Pro');
    // Stripe redirect-back: celebrate + refresh the user plan
    const upgrade = new URLSearchParams(window.location.search).get('upgrade');
    if (upgrade === 'success') {
      toast({ title: 'Payment received!', description: 'Your plan will activate in a few seconds.' });
      setTimeout(() => window.location.reload(), 2500);
    } else if (upgrade === 'cancelled') {
      toast({ title: 'Checkout cancelled', description: 'No charge was made.', variant: 'destructive' });
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('GenAiWorkspaceTheme', next);
  };

  const choose = async (planId: string) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    if (planId === 'free') {
      setBusy(planId);
      try {
        await setPlan('free');
        toast({ title: 'Plan updated', description: 'You are on the Free plan' });
      } finally {
        setBusy(null);
      }
      return;
    }
    // Paid plans go through Stripe Checkout when configured; fall back to
    // instant activation (dev/demo mode) when Stripe keys are absent.
    setBusy(planId);
    try {
      const r = await authApi.checkout(planId as 'plus' | 'pro');
      if (r.checkout_url) {
        window.location.href = r.checkout_url;
        return;
      }
      await setPlan(planId);
      toast({
        title: `Welcome to ${planId === 'plus' ? 'Plus' : 'Pro'}!`,
        description: 'Plan activated instantly (Stripe keys not set — demo mode).',
      });
    } catch (e: any) {
      toast({ title: 'Could not update plan', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="relative flex h-screen flex-col overflow-y-auto bg-background text-foreground">
        {/* Aurora */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="animate-aurora absolute -top-40 right-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-15 blur-3xl" />
          <div className="animate-aurora absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 opacity-10 blur-3xl" style={{ animationDelay: '-6s' }} />
        </div>

        {/* Nav */}
        <header className="relative z-10 mx-auto flex w-full max-w-6xl flex-shrink-0 items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src="/brand/ai-chip.png" alt="AI" className="h-8 w-8 rounded-xl shadow-sm" />
            <span className="text-sm font-bold tracking-tight">GenAI Workspace</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button onClick={toggleTheme} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
            </Button>
          </div>
        </header>

        {/* Header — centered, compact */}
        <section className="relative z-10 mx-auto flex w-full max-w-4xl flex-shrink-0 flex-col items-center px-6 pb-5 pt-2 text-center">
          <h1 className="animate-fade-up text-xl font-bold tracking-tight md:text-3xl">
            Pay for the agent that{' '}
            <span className="animate-gradient-pan bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 bg-clip-text text-transparent">
              does the work
            </span>
          </h1>
          <p className="animate-fade-up mt-1 text-xs text-muted-foreground md:text-sm" style={{ animationDelay: '60ms' }}>
            Pro model · real actions · limits built for daily use
          </p>
          <div className="animate-fade-up mt-3 inline-flex items-center rounded-full border border-border bg-card p-1" style={{ animationDelay: '100ms' }}>
            <button
              onClick={() => setYearly(false)}
              className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${!yearly ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`rounded-full px-3.5 py-1 text-xs font-medium transition-all ${yearly ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              Yearly <span className="ml-0.5 text-[10px] text-emerald-500">−20%</span>
            </button>
          </div>
        </section>

        {/* Cards — fill remaining viewport, no scroll */}
        <section className="relative z-10 mx-auto grid w-full max-w-6xl min-h-0 flex-1 content-start gap-5 px-6 pb-3 md:grid-cols-3">
          {PLANS.map((plan, i) => {
            const isCurrent = user?.plan === plan.id;
            const price = yearly ? plan.yearly : plan.monthly;
            return (
              <div
                key={plan.id}
                className={`animate-fade-up group relative flex flex-col overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${
                  plan.popular
                    ? 'scale-[1.03] border-transparent bg-card/80 shadow-xl shadow-blue-500/15'
                    : 'border-border bg-card/70 hover:border-foreground/20'
                }`}
                style={{ animationDelay: `${160 + i * 120}ms` }}
              >
                {/* gradient edge + inner glow on the popular plan */}
                {plan.popular && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/15 via-transparent to-indigo-600/15" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
                  </>
                )}
                <div className="relative flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${plan.gradient} shadow-md transition-transform duration-300 group-hover:scale-110`}>
                    <plan.icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold leading-tight">{plan.name}</h3>
                    <p className="truncate text-[11px] text-muted-foreground">{plan.tagline}</p>
                  </div>
                  {plan.popular && !isCurrent && (
                    <span className="flex-shrink-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
                      Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span className="flex-shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                      Your plan
                    </span>
                  )}
                </div>

                <div className="relative mt-4 flex items-baseline gap-1.5">
                  <span className={`text-4xl font-bold tracking-tight ${plan.popular ? 'bg-gradient-to-br from-blue-500 to-indigo-600 bg-clip-text text-transparent' : ''}`}>${price}</span>
                  <span className="text-xs text-muted-foreground">/mo{yearly && price > 0 ? ' · billed yearly' : ''}</span>
                </div>

                <ul className="relative mt-4 flex-1 space-y-2">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85 md:text-[13px]">
                      <Check className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${plan.accent}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => choose(plan.id)}
                  disabled={busy !== null || isCurrent}
                  size="sm"
                  className={`relative mt-4 w-full ${
                    plan.popular && !isCurrent
                      ? `bg-gradient-to-r ${plan.gradient} text-white shadow-md hover:opacity-90`
                      : ''
                  }`}
                  variant={plan.popular && !isCurrent ? 'default' : 'outline'}
                >
                  {busy === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    'Current plan'
                  ) : user ? (
                    plan.cta
                  ) : (
                    `Get ${plan.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </section>

        {/* Footnote */}
        <p className="relative z-10 flex-shrink-0 pb-3 text-center text-[11px] text-muted-foreground">
          {user ? `Signed in as ${user.email} · ` : ''}Plans activate instantly — no card required.
        </p>
      </div>

      <AuthModal />
    </div>
  );
};

export default Pricing;
