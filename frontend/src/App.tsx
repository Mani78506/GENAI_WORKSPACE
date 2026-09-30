import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";

import Landing from "./pages/Landing";
import Index from "./pages/Index";
import Pricing from "./pages/Pricing";
import Settings from "./pages/Settings";
import GithubCallback from "./pages/GithubCallback";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Reminders from "./pages/Reminders";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/app" element={<Index mode="unified" />} />
            <Route path="/assistant" element={<Index mode="unified" />} />
            <Route path="/search" element={<Index mode="unified" />} />
            <Route path="/agent" element={<Index mode="unified" />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/auth/github/callback" element={<GithubCallback />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
