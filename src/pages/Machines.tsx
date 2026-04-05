import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DollarSign, Plus, MapPin, CreditCard, Banknote, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, isAfter, isBefore, subWeeks, subMonths, subYears, format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type TimeFilter = "week" | "month" | "year" | "lifetime";

type Machine = {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
};

type MachineSale = {
  id: string;
  machine_id: string;
  date: string;
  cash_amount: number;
  credit_amount: number;
};

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "lifetime", label: "Lifetime" },
];

function getFilterRange(filter: TimeFilter, offset: number, weekStartsOn: 0|1|2|3|4|5|6 = 0): { start: Date; end: Date } | null {
  const now = new Date();
  if (filter === "week") {
    const base = subWeeks(startOfWeek(now, { weekStartsOn }), -offset);
    return { start: base, end: endOfWeek(base, { weekStartsOn }) };
  }
  if (filter === "month") {
    const base = subMonths(startOfMonth(now), -offset);
    return { start: base, end: endOfMonth(base) };
  }
  if (filter === "year") {
    const base = subYears(startOfYear(now), -offset);
    return { start: base, end: endOfYear(base) };
  }
  return null;
}

function getPeriodLabel(filter: TimeFilter, offset: number, weekStartsOn: 0|1|2|3|4|5|6 = 0): string {
  const range = getFilterRange(filter, offset, weekStartsOn);
  if (!range) return "";
  if (filter === "week") return `${format(range.start, "MMM d")}–${format(range.end, "MMM d, yyyy")}`;
  if (filter === "month") return format(range.start, "MMMM yyyy");
  if (filter === "year") return format(range.start, "yyyy");
  return "";
}

export default function Machines() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sales, setSales] = useState<MachineSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("lifetime");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState<0|1|2|3|4|5|6>(0);

  useEffect(() => { setPeriodOffset(0); }, [timeFilter]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_settings").select("week_start_day").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setWeekStartDay(data.week_start_day as 0|1|2|3|4|5|6);
    });
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [machinesRes, salesRes] = await Promise.all([
      supabase.from("machines").select("*").eq("user_id", user.id),
      supabase.from("machine_sales").select("*").eq("user_id", user.id),
    ]);
    setMachines((machinesRes.data as Machine[]) || []);
    setSales((salesRes.data as MachineSale[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const range = getFilterRange(timeFilter, periodOffset, weekStartDay);

  const filteredSales = sales.filter((s) => {
    if (!range) return true;
    const d = new Date(s.date);
    return !isBefore(d, range.start) && !isAfter(d, range.end);
  });

  const totalCash = filteredSales.reduce((s, e) => s + Number(e.cash_amount), 0);
  const totalCredit = filteredSales.reduce((s, e) => s + Number(e.credit_amount), 0);
  const totalRevenue = totalCash + totalCredit;

  // Revenue per machine for the current filtered period
  const revByMachine = filteredSales.reduce<Record<string, number>>((acc, s) => {
    acc[s.machine_id] = (acc[s.machine_id] || 0) + Number(s.cash_amount) + Number(s.credit_amount);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!user || !newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("machines").insert({
      user_id: user.id,
      name: newName.trim(),
      location: newLocation.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Machine added" });
      setNewName("");
      setNewLocation("");
      setAddOpen(false);
      fetchData();
    }
  };

  const showNavigation = timeFilter !== "lifetime";

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Machines</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* Summary Stats */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Summary</CardTitle>
            <div className="flex gap-1">
              {TIME_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTimeFilter(f.value)}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                    timeFilter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {/* Period Navigation */}
          {showNavigation && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPeriodOffset(o => o - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium min-w-[140px] text-center">
                {getPeriodLabel(timeFilter, periodOffset, weekStartDay)}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={periodOffset >= 0} onClick={() => setPeriodOffset(o => o + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <Banknote className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-sm font-semibold">${totalCash.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <CreditCard className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Credit</p>
              <p className="text-sm font-semibold">${totalCredit.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <DollarSign className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-sm font-semibold">${totalRevenue.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Machine List */}
      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-8">Loading...</p>
      ) : machines.length === 0 ? (
        <Card className="py-8">
          <p className="text-center text-sm text-muted-foreground">No machines yet. Tap Add to create one.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {machines.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/machines/${m.id}`)}
            >
              <CardContent className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  {m.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {m.location}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{timeFilter === "lifetime" ? "All time" : getPeriodLabel(timeFilter, periodOffset)}</p>
                  <p className="text-sm font-semibold">${(revByMachine[m.id] || 0).toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Machine Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Machine</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Mall Entrance" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. 123 Main St" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd} disabled={saving || !newName.trim()}>
              {saving ? "Saving..." : "Add Machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
