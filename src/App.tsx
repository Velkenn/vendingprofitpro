import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SKUDetailProvider } from "@/contexts/SKUDetailContext";
import AppShell from "@/components/AppShell";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Index from "@/pages/Index";
import Receipts from "@/pages/Receipts";
import ReceiptDetail from "@/pages/ReceiptDetail";
import Stats from "@/pages/Stats";
import SKUs from "@/pages/SKUs";
import NeedsReview from "@/pages/NeedsReview";
import NeedsPrice from "@/pages/NeedsPrice";
import Purchases from "@/pages/Purchases";
import CostTrends from "@/pages/CostTrends";
import ProfitLeaderboard from "@/pages/ProfitLeaderboard";
import SettingsPage from "@/pages/SettingsPage";
import AdminPanel from "@/pages/AdminPanel";
import Export from "@/pages/Export";
import Machines from "@/pages/Machines";
import MachineDetail from "@/pages/MachineDetail";
import Chat from "@/pages/Chat";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/app" element={<Index />} />
        <Route path="/app/receipts" element={<Receipts />} />
        <Route path="/app/receipts/:id" element={<ReceiptDetail />} />
        <Route path="/app/stats" element={<Stats />} />
        <Route path="/app/skus" element={<SKUs />} />
        <Route path="/app/needs-review" element={<NeedsReview />} />
        <Route path="/app/needs-price" element={<NeedsPrice />} />
        <Route path="/app/purchases" element={<Purchases />} />
        <Route path="/app/cost-trends" element={<CostTrends />} />
        <Route path="/app/profit-leaderboard" element={<ProfitLeaderboard />} />
        <Route path="/app/machines" element={<Machines />} />
        <Route path="/app/machines/:id" element={<MachineDetail />} />
        <Route path="/app/chat" element={<Chat />} />
        <Route path="/app/settings" element={<SettingsPage />} />
        <Route path="/app/admin" element={<AdminPanel />} />
        <Route path="/app/export" element={<Export />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SKUDetailProvider>
            <AppRoutes />
          </SKUDetailProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
