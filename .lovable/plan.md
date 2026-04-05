

## Landing Page + App Routing Restructure

### Overview
Create a new public landing page at `/` based on the PDF design, and move all authenticated app routes under `/app/*`. CTA buttons ("Start Tracking Free", "Try It Free", sign up links) will navigate to `/auth`.

### Architecture Change

```text
Before:
  /         → Dashboard (protected)
  /auth     → Login/Signup
  /stats    → Stats (protected)
  ...

After:
  /         → Landing Page (public)
  /auth     → Login/Signup  
  /app      → Dashboard (protected)
  /app/stats → Stats (protected)
  ...
```

### Technical Details

**1. New file: `src/pages/Landing.tsx`**
- Recreate the full landing page from the PDF as a React component using Tailwind CSS (not inline styles)
- Sections: Nav bar, Hero, Action buttons preview, Stats row, Problem/Solution cards, Features grid, Chip AI section, How it works steps, Tech stack, Quote/testimonial, Final CTA, Footer
- Import Fraunces font via Google Fonts in `index.html`
- All CTA links ("Start Tracking Free", nav "Try It Free") use `<Link to="/auth">` or `<a href="/auth">`
- FadeIn animation using IntersectionObserver
- Sticky nav that changes style on scroll (green bg → frosted white)
- Mobile-first, responsive

**2. Edit: `src/App.tsx`**
- Import Landing page
- Add public route: `<Route path="/" element={<Landing />} />`
- Wrap all protected routes under `/app` prefix:
  - `/app` → Index (dashboard)
  - `/app/receipts` → Receipts
  - `/app/stats` → Stats
  - `/app/machines` → Machines
  - etc.
- Update `ProtectedRoute` redirect from `/auth` stays the same
- After login, redirect to `/app` instead of `/`

**3. Edit: `src/contexts/AuthContext.tsx`** (if it handles post-login redirect)
- Update any redirect from `/` to `/app`

**4. Edit: `src/pages/Auth.tsx`**
- Change post-login redirect from `/` to `/app`
- Landing page already links to `/auth` for signup

**5. Edit: `src/components/BottomNav.tsx`**
- Update all nav links from `/` to `/app`, `/stats` to `/app/stats`, etc.

**6. Edit: `src/components/NavLink.tsx`**
- Update any hardcoded paths if present

**7. Edit: `src/pages/SettingsPage.tsx`**
- Update any internal links (SKUs → `/app/skus`, etc.)

**8. Edit: `index.html`**
- Add Fraunces font import

**9. Edit: All page components with internal `navigate()` or `<Link>` calls**
- Update paths to include `/app` prefix (ReceiptDetail, Stats, Machines, MachineDetail, Chat, etc.)

### Files changed
- **New**: `src/pages/Landing.tsx` — full landing page from PDF design
- **Edit**: `index.html` — add Fraunces font
- **Edit**: `src/App.tsx` — add landing route at `/`, move protected routes under `/app`
- **Edit**: `src/pages/Auth.tsx` — redirect to `/app` after login
- **Edit**: `src/components/BottomNav.tsx` — update all paths to `/app/*`
- **Edit**: `src/components/NavLink.tsx` — update paths
- **Edit**: `src/pages/SettingsPage.tsx` — update internal links
- **Edit**: `src/pages/Index.tsx` — update any navigate calls
- **Edit**: `src/pages/ReceiptDetail.tsx` — update navigate paths
- **Edit**: `src/pages/Stats.tsx` — update navigate paths
- **Edit**: `src/pages/Machines.tsx` — update navigate paths
- **Edit**: `src/pages/MachineDetail.tsx` — update navigate paths
- **Edit**: `src/pages/Chat.tsx` — update if needed
- **Edit**: `src/pages/Receipts.tsx` — update navigate paths

