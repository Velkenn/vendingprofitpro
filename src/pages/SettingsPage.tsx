import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, AlertTriangle, Tag, ShoppingCart, TrendingUp, Trophy, FileDown,
  ChevronRight
} from "lucide-react";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const menuItems = [
  { path: "/needs-review", label: "Needs Review", icon: AlertTriangle },
  { path: "/needs-price", label: "Needs Price", icon: Tag },
  { path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { path: "/cost-trends", label: "Cost Trends", icon: TrendingUp },
  { path: "/profit-leaderboard", label: "Profit Leaderboard", icon: Trophy },
  { path: "/export", label: "Export Reports", icon: FileDown },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState("0");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("week_start_day")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setWeekStart(String(data.week_start_day));
      });
  }, [user]);

  const saveWeekStart = async (val: string) => {
    if (!user) return;
    setWeekStart(val);
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, week_start_day: parseInt(val) }, { onConflict: "user_id" });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Settings</h1>

      <div className="space-y-2 mb-6">
        {menuItems.map(({ path, label, icon: Icon }) => (
          <Card key={path} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(path)}>
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 font-medium text-sm">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-sm">Week Start Day</p>
          <Select value={weekStart} onValueChange={saveWeekStart}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {days.map((d, i) => (
                <SelectItem key={i} value={String(i)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full gap-2 text-destructive" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sign Out
      </Button>
    </div>
  );
}
