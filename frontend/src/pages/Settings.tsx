import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  ArrowLeft,
  Sun,
  Moon,
  User as UserIcon,
  Lock,
  Crown,
  Loader2,
  Check,
  LogOut,
  ShieldCheck,
  Download,
  Trash2,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { AuthModal } from '@/components/AuthModal';
import { authApi, getToken } from '@/api/auth';
import { setPageMeta } from '@/lib/page-meta';
import { toast } from '@/hooks/use-toast';

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  plus: 'bg-blue-500/15 text-blue-500 border border-blue-500/30',
  pro: 'bg-violet-500/15 text-violet-500 border border-violet-500/30',
};

const Settings = () => {
  const { user, loading, logout, updateProfile, setAuthModalOpen } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('GenAiWorkspaceTheme') || 'dark');

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    setPageMeta('Settings · Account & plan');
  }, []);

  useEffect(() => {
    if (user) setName(user.name || '');
  }, [user]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('GenAiWorkspaceTheme', next);
  };

  const saveName = async () => {
    setSavingName(true);
    try {
      await updateProfile(name);
      toast({ title: 'Profile updated', description: 'Your name was saved.' });
    } catch (e: any) {
      toast({ title: 'Could not update profile', description: e.message, variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    setSavingPw(true);
    try {
      await authApi.changePassword(curPw || null, newPw);
      toast({ title: 'Password updated', description: 'Your new password is active.' });
      setCurPw('');
      setNewPw('');
    } catch (e: any) {
      toast({ title: 'Could not change password', description: e.message, variant: 'destructive' });
    } finally {
      setSavingPw(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Export this account's chats as a JSON download
  const exportChats = async () => {
    const local = sessionStorage.getItem(`GenAiWorkspaceChats:u${user?.id}`);
    const chats = user ? await authApi.getChats() : (local ? JSON.parse(local) : []);
    const blob = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `genai-workspace-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: 'Export complete', description: `${chats.length} chats downloaded as JSON.` });
  };

  // Permanently delete the account + server-side data, then land on the landing page
  const deleteAccount = async () => {
    if (!confirm(' permanently delete your account? This cannot be undone.'.trim())) return;
    try {
      await authApi.deleteAccount();
      logout();
      toast({ title: 'Account deleted', description: 'Your account and data have been removed.' });
      window.location.href = '/';
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  // Clear ALL of this account's chat data — local namespace + server copy
  const clearHistory = async () => {
    if (!confirm('Delete all your chats? This removes them from this device and your account.')) return;
    if (user) await authApi.saveChats([]);
    if (user) sessionStorage.removeItem(`GenAiWorkspaceChats:u${user.id}`);
    sessionStorage.removeItem(`GenAiWorkspaceLastActiveChatId:u${user?.id}`);
    toast({ title: 'History cleared', description: 'All chats deleted from this device and your account.' });
    window.location.href = '/app';
  };

  // Not signed in → gate the whole page behind the auth modal
  if (!loading && !user) {
    return (
      <div className={theme === 'dark' ? 'dark' : ''}>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600">
            <UserIcon className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">Sign in required</h1>
          <p className="mt-2 text-sm text-muted-foreground">Log in to manage your account settings.</p>
          <Button onClick={() => setAuthModalOpen(true)} className="mt-6 bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90">
            Sign in
          </Button>
        </div>
        <AuthModal />
      </div>
    );
  }

  const hasPassword = user?.provider === 'email' || !!user?.provider;

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="animate-aurora absolute -top-40 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10 blur-3xl" />
        </div>

        {/* Nav */}
        <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/assistant" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight">Settings</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button onClick={toggleTheme} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/assistant"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to app</Link>
            </Button>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-3xl space-y-5 px-6 pb-16">
          {/* Profile */}
          <section className="animate-fade-up rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserIcon className="h-4 w-4 text-blue-500" /> Profile
            </h2>
            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
                {(user?.name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user?.name || 'Unnamed'}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PLAN_COLORS[user?.plan || 'free']}`}>
                  {user?.plan === 'pro' && <Crown className="h-2.5 w-2.5" />}{user?.plan} plan
                </span>
              </div>
            </div>
            <div className="mt-5 flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <Button onClick={saveName} disabled={savingName || !name.trim() || name === user?.name} size="sm">
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1.5 h-3.5 w-3.5" />Save</>}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Signed in via {user?.provider || 'email'} · joined {user?.created_at?.split(' ')[0]}</p>
          </section>

          {/* Password */}
          <section className="animate-fade-up rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-sm" style={{ animationDelay: '100ms' }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-blue-500" /> Password
            </h2>
            {user?.provider === 'email' ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Current password</label>
                  <Input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="••••••••" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">New password</label>
                  <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 6 characters" />
                </div>
                <div className="sm:col-span-2">
                  <Button onClick={savePassword} disabled={savingPw || newPw.length < 6 || !curPw} size="sm">
                    {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  You signed up with {user?.provider} — no password set. Set one to also enable email sign-in.
                </p>
                <div className="max-w-sm">
                  <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 6 chars)" />
                </div>
                <Button onClick={savePassword} disabled={savingPw || newPw.length < 6} size="sm">
                  {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set password'}
                </Button>
              </div>
            )}
          </section>

          {/* Plan */}
          <section className="animate-fade-up rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-sm" style={{ animationDelay: '200ms' }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Crown className="h-4 w-4 text-violet-500" /> Plan
            </h2>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <div className="text-sm font-medium capitalize">{user?.plan} plan</div>
                <div className="text-xs text-muted-foreground">
                  {user?.plan === 'pro' ? 'Unlimited messages' : user?.plan === 'plus' ? '1,000 messages / day' : '50 messages / day'}
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/pricing">{user?.plan === 'pro' ? 'Manage plan' : 'Upgrade'}</Link>
              </Button>
            </div>
          </section>

          {/* Data controls */}
          <section className="animate-fade-up rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-sm" style={{ animationDelay: '250ms' }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-emerald-500" /> Your data
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Your chats are stored in your account — you control what stays.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={exportChats} variant="outline" size="sm">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export chats (JSON)
              </Button>
              <Button onClick={clearHistory} variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear all chats
              </Button>
            </div>
          </section>

          {/* Danger */}
          <section className="animate-fade-up rounded-2xl border border-destructive/30 bg-card/70 p-6 backdrop-blur-sm" style={{ animationDelay: '300ms' }}>
            <h2 className="text-sm font-semibold text-destructive">Session</h2>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Sign out of GenAI Workspace on this device.</p>
              <Button onClick={handleLogout} variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
                <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
              </Button>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-destructive/20 pt-4">
              <p className="text-xs text-muted-foreground">
                Permanently delete your account — chats, usage, and plan data are removed.
              </p>
              <Button onClick={deleteAccount} variant="destructive" size="sm" disabled={!user}>
                Delete account
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Settings;
