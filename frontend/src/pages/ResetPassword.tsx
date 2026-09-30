import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/api/auth';
import { setPageMeta } from '@/lib/page-meta';
import { toast } from '@/hooks/use-toast';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPageMeta('Reset password · GenAI Workspace');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) {
      toast({ title: "Passwords don't match", variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword(token, pw);
      setDone(true);
      setTimeout(() => navigate('/app'), 1800);
    } catch (err: any) {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <img src="/brand/ai-chip.png" alt="AI" className="mx-auto mb-4 h-12 w-12 rounded-xl" />
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-500" />
            <h1 className="text-lg font-semibold">Password updated</h1>
            <p className="mt-1 text-xs text-muted-foreground">Signing you in to the workspace…</p>
          </div>
        ) : !token ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Invalid reset link</h1>
            <p className="mt-1 text-xs text-muted-foreground">Request a fresh link from the sign-in page.</p>
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link to="/"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back to home</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-center text-lg font-semibold">Set a new password</h1>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (min 6 chars)" className="pl-9" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="password" required minLength={6} value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" className="pl-9" />
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
