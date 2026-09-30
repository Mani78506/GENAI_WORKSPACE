import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPageMeta } from "@/lib/page-meta";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    setPageMeta("Page not found · GenAI Workspace");
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="animate-aurora absolute -top-32 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 opacity-15 blur-3xl" />
        <div className="animate-aurora absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 opacity-10 blur-3xl" style={{ animationDelay: "-6s" }} />
      </div>

      <div className="relative z-10 max-w-md text-center">
        <img src="/brand/ai-chip.png" alt="GenAI Workspace" className="mx-auto mb-6 h-14 w-14 rounded-2xl shadow-lg" />
        <h1 className="animate-gradient-pan bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 bg-clip-text text-6xl font-bold text-transparent">
          404
        </h1>
        <p className="mt-3 text-lg font-semibold">This page doesn't exist</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{location.pathname}</code> isn't part of the workspace — let the agent take you back.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link to="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/app"><Search className="mr-1.5 h-4 w-4" /> Open the app</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
