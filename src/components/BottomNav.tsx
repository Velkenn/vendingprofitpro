import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Receipt, Package, BarChart3, Settings, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/receipts", icon: Receipt, label: "Receipts" },
  { path: "/stats", icon: BarChart3, label: "Stats" },
  { path: "/skus", icon: Package, label: "SKUs" },
  { path: "/settings", icon: Settings, label: "More" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around py-1">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors rounded-lg",
                active ? "text-primary font-semibold" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", path === "/stats" && "h-6 w-6")} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
