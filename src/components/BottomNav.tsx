import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Receipt, BarChart3, Settings, Monitor, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/app", icon: LayoutDashboard, label: "Home" },
  { path: "/app/chat", icon: MessageCircle, label: "Chat" },
  { path: "/app/stats", icon: BarChart3, label: "Stats" },
  { path: "/app/machines", icon: Monitor, label: "Machines" },
  { path: "/app/receipts", icon: Receipt, label: "Receipts" },
  { path: "/app/settings", icon: Settings, label: "More" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around py-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = path === "/app" ? location.pathname === "/app" : location.pathname.startsWith(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors rounded-lg",
                active ? "text-primary font-semibold" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", path === "/app/stats" && "h-6 w-6")} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
