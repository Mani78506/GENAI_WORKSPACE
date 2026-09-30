import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const GithubCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGithub } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get('code');
    if (!code) {
      toast({ title: 'GitHub sign-in cancelled', variant: 'destructive' });
      navigate('/', { replace: true });
      return;
    }
    loginWithGithub(code)
      .then(() => {
        toast({ title: 'Welcome!', description: 'Signed in with GitHub' });
        navigate('/', { replace: true });
      })
      .catch((e: any) => {
        toast({ title: 'GitHub sign-in failed', description: e.message, variant: 'destructive' });
        navigate('/', { replace: true });
      });
  }, [params, loginWithGithub, navigate]);

  return (
    <div className="dark flex h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Completing GitHub sign-in…
      </div>
    </div>
  );
};

export default GithubCallback;
