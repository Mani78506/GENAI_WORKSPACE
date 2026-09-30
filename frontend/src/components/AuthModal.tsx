"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, Mail, Lock, User as UserIcon, Loader2, Github, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { authApi } from '@/api/auth';

declare global {
  interface Window {
    google?: any;
  }
}

export const AuthModal = () => {
  const { authModalOpen, setAuthModalOpen, login, signup, loginWithGoogle, messagesLeft, canSend } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'sent'>('login');
  const [resetHint, setResetHint] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | 'github' | null>(null);
  const [config, setConfig] = useState<{ google_client_id: string | null; github_client_id: string | null }>({ google_client_id: null, github_client_id: null });
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authModalOpen) authApi.config().then(setConfig);
  }, [authModalOpen]);

  // Render Google sign-in button when configured
  useEffect(() => {
    if (!authModalOpen || !config.google_client_id || !googleBtnRef.current) return;
    const init = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: config.google_client_id,
        callback: async (resp: any) => {
          setBusy('google');
          try {
            await loginWithGoogle(resp.credential);
            toast({ title: 'Welcome!', description: 'Signed in with Google' });
          } catch (e: any) {
            toast({ title: 'Google sign-in failed', description: e.message, variant: 'destructive' });
          } finally {
            setBusy(null);
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline', size: 'large', width: '100%', text: 'continue_with',
      });
    };
    if (window.google?.accounts?.id) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    }
  }, [authModalOpen, config.google_client_id, loginWithGoogle]);

  if (!authModalOpen) return null;

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('email');
    try {
      const r = await authApi.forgotPassword(email);
      setResetHint(r.dev_link || null); // shown only when SMTP isn't configured (demo fallback)
      setMode('sent');
    } catch (err: any) {
      toast({ title: 'Could not send reset email', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('email');
    try {
      if (mode === 'login') await login(email, password);
      else await signup(name, email, password);
      toast({ title: mode === 'login' ? 'Welcome back!' : 'Account created', description: email });
    } catch (err: any) {
      toast({ title: mode === 'login' ? 'Login failed' : 'Signup failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleGithub = () => {
    if (!config.github_client_id) {
      toast({ title: 'GitHub sign-in not configured', description: 'Add GITHUB_CLIENT_ID to the backend .env to enable it.' });
      return;
    }
    const redirect = `${window.location.origin}/auth/github/callback`;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${config.github_client_id}&redirect_uri=${encodeURIComponent(redirect)}&scope=read:user%20user:email`;
  };

  const handleGoogleFallback = () => {
    toast({ title: 'Google sign-in not configured', description: 'Add GOOGLE_CLIENT_ID to the backend .env to enable it.' });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAuthModalOpen(false)} />

      <div className="animate-fade-up relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/brand/ai-chip.png" alt="AI" className="h-8 w-8 rounded-lg" />
            <div>
              <h2 className="text-sm font-semibold">
                {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {mode === 'login' ? 'Sign in to GenAI Workspace' : mode === 'signup' ? 'Get started with GenAI Workspace' : 'We\'ll email you a reset link'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAuthModalOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-5">
          {/* forgot-password views */}
          {(mode === 'forgot' || mode === 'sent') ? (
            mode === 'sent' ? (
              <div className="animate-fade-up py-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                  <Mail className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-sm font-medium">Check your inbox</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If <span className="text-foreground">{email}</span> has an account, a reset link is on its way.
                </p>
                {resetHint && (
                  <p className="mt-3 break-all rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-600 dark:text-amber-400">
                    Email not configured — dev reset link: {resetHint}
                  </p>
                )}
                <button onClick={() => setMode('login')} className="mt-4 text-xs font-medium text-blue-500 hover:underline">
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enter your account email — we'll send a link to set a new password.
                </p>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="pl-9" autoComplete="email" />
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90" disabled={busy !== null}>
                  {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Email me a reset link'}
                </Button>
                <p className="text-center text-xs">
                  <button type="button" onClick={() => setMode('login')} className="font-medium text-blue-500 hover:underline">
                    Back to sign in
                  </button>
                </p>
              </form>
            )
          ) : (
          <>
          {/* mode tabs */}
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md py-1.5 text-sm font-medium transition-all duration-200 ${
                  mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* social */}
          <div className="space-y-2.5">
            {config.google_client_id ? (
              <div ref={googleBtnRef} className="w-full [&>div]:!w-full" />
            ) : (
              <button
                type="button"
                onClick={handleGoogleFallback}
                disabled={busy === 'google'}
                className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a7.14 7.14 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                )}
                Continue with Google
              </button>
            )}
            <button
              type="button"
              onClick={handleGithub}
              disabled={busy === 'github'}
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {busy === 'github' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4 flex-shrink-0" />}
              Continue with GitHub
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or continue with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* email form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative animate-fade-up">
                <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="pl-9" autoComplete="name" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="pl-9" autoComplete="email" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Password (min 6 chars)' : 'Password'} className="pl-9" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="mt-1.5 block w-full text-right text-[11px] text-muted-foreground transition-colors hover:text-blue-500"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90" disabled={busy !== null}>
              {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === 'login' ? (
              <>New here? <button className="font-medium text-blue-500 hover:underline" onClick={() => setMode('signup')}>Create an account</button></>
            ) : (
              <>Already have an account? <button className="font-medium text-blue-500 hover:underline" onClick={() => setMode('login')}>Sign in</button></>
            )}
          </p>

          {canSend && (
            <button
              onClick={() => setAuthModalOpen(false)}
              className="mt-3 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Continue as guest — {messagesLeft} free message{messagesLeft === 1 ? '' : 's'} remaining
            </button>
          )}

          <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
            Demo: demo@genai.app · demo123
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
};
