import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
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
import Export from "@/pages/Export";
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
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<Index />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/receipts/:id" element={<ReceiptDetail />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/skus" element={<SKUs />} />
        <Route path="/needs-review" element={<NeedsReview />} />
        <Route path="/needs-price" element={<NeedsPrice />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/cost-trends" element={<CostTrends />} />
        <Route path="/profit-leaderboard" element={<ProfitLeaderboard />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/export" element={<Export />} />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
