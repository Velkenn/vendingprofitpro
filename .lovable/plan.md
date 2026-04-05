

## Fix Week Start Day — Persist State + Use in Stats/Machines

### Problem
1. The week start day setting saves to the database but the Settings page doesn't show a success toast, so it feels like it doesn't save.
2. `Stats.tsx`, `Machines.tsx`, and `MachineDetail.tsx` all hardcode `weekStartsOn: 0` (Sunday) instead of reading the user's saved preference.

### Fix

**All 4 files need the same pattern**: fetch `user_settings.week_start_day` and use it in `startOfWeek`/`endOfWeek` calls.

**`src/pages/SettingsPage.tsx`**
- Add a success toast after saving: `toast({ title: "Saved" })`

**`src/pages/Stats.tsx`**
- Fetch `week_start_day` from `user_settings` on mount (same pattern as SettingsPage)
- Pass it into the `getFilterRange` function instead of hardcoded `0`
- Update `startOfWeek(..., { weekStartsOn: userWeekStart })` and `endOfWeek` accordingly

**`src/pages/Machines.tsx`**
- Same: fetch `week_start_day`, replace hardcoded `weekStartsOn: 0`

**`src/pages/MachineDetail.tsx`**
- Same: fetch `week_start_day`, replace hardcoded `weekStartsOn: 0`

### Files changed
- **Edit**: `src/pages/SettingsPage.tsx` — add success toast
- **Edit**: `src/pages/Stats.tsx` — fetch + use week_start_day
- **Edit**: `src/pages/Machines.tsx` — fetch + use week_start_day
- **Edit**: `src/pages/MachineDetail.tsx` — fetch + use week_start_day

