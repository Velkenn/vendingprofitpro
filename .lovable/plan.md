
## Change Home Tab Title to VendIQ

### What's changing
The home page (Index.tsx) currently displays "Dashboard" as the main heading. The user wants to change this to "VendIQ".

### Implementation
Simple one-line text replacement:
- File: `src/pages/Index.tsx`
- Line 150: Change `<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>` to `<h1 className="text-2xl font-bold tracking-tight">VendIQ</h1>`

### Result
The home tab heading will now display "VendIQ" instead of "Dashboard" while maintaining all existing styling and layout.
