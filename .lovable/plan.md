
## Automatic SKU Status Transition: Test → Core/Failed

### Current State Analysis
Looking at the codebase, I can see:
- SKUs have a `rebuy_status` field with values: "Rebuy", "Test", "Do Not Rebuy"
- Purchase data is tracked via `receipt_items` table with `receipt_date` from `receipts`
- The user wants to add "Core" and "Failed" as additional rebuy statuses
- Need automatic rules to transition "Test" SKUs based on purchase frequency

### Business Rules
- **Test → Core**: SKU purchased more than once every 30 days (high frequency)
- **Test → Failed**: SKU purchased less than once every 60 days (low frequency)  
- **Test remains Test**: Purchase frequency between these thresholds

### Implementation Plan

**1. Database Schema Updates**
- Update `rebuy_status_type` enum to include "Core" and "Failed" statuses
- This will automatically update the `skus` table and existing code

**2. Create Background Logic**
- Add a database function to calculate purchase frequency for Test SKUs
- Create a function to automatically update rebuy_status based on rules
- This can be triggered manually or via a scheduled job

**3. Purchase Frequency Calculation**
Query logic needed:
```sql
-- For each Test SKU, calculate purchase frequency over last 90 days
-- Count distinct receipt dates where SKU was purchased
-- Calculate days between first and last purchase
-- Apply transition rules
```

**4. UI Updates** 
- Update SKUs page to display "Core" and "Failed" statuses with appropriate colors
- The existing rebuy status display logic will automatically handle new values

**5. Implementation Approach**
- Database migration for enum update
- Database function for status transition logic
- Edge function for periodic status updates (optional)
- UI updates for new status display

### Key Technical Details
- Purchase frequency calculated from `receipt_items` joined with `receipts` for dates
- Time window analysis over last 90 days to allow sufficient data
- Transition rules applied only to SKUs with current status "Test"
- Preserve manual overrides (don't auto-transition if manually set)

The system will automatically evaluate Test SKUs and promote high-performing ones to Core while demoting low-performing ones to Failed, helping optimize inventory decisions.
