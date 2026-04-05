

## Auto-redirect Logged-in Users Past Landing Page

### Problem
Returning users who visit the root URL (`/`) see the marketing landing page every time, even though they're already authenticated.

### Fix

**Edit: `src/pages/Landing.tsx`**
- Import `useAuth` from `AuthContext` and `useNavigate` from React Router
- Add a `useEffect` that checks if the user has an active session — if so, navigate to `/app` with `replace: true`
- Show a brief loading state while the auth check runs to avoid a flash of the landing page

This is the same pattern already used in `Auth.tsx` for redirecting logged-in users.

### Files changed
- **Edit**: `src/pages/Landing.tsx` — add session check + redirect to `/app`

