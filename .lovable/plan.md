

## Fix Store Grouping — Group by Store Name + City

### Problem
The current `calculateStoreSpend` uses the full `store_location` string (including street address) as the grouping key, causing entries like "Sam's Club — Sam's Club 1670 W UNIVERSITY DR, Mckinney, TX 75069" and "Sam's Club — Sam's Club, 1670 W UNIVERSITY DR, Mckinney, TX 75069" to appear as separate entries.

### Solution
Extract just the **store name** and **city** from `store_location` to create the grouping key. Display format: `"Sam's Club — Mckinney"` or `"Walmart — Allen"`.

### Implementation (single file: `src/pages/Stats.tsx`)

Add a helper function `extractCity(location: string)` that:
1. Splits the location string by commas
2. Looks for a segment that matches a city pattern (word before state abbreviation like "TX", "CA", etc.) or simply takes the second-to-last segment (city typically appears before "STATE ZIP")
3. Falls back: parse common patterns like `"..., CityName, ST ZIPCODE"` — grab the city part
4. Trims and title-cases it

Update `calculateStoreSpend`:
- Build key as `"${storeName} — ${city}"` instead of full address
- For items with no `store_location`, group by store name alone
- For items where city can't be extracted, find the most-visited city for that store name and group with it

**Before:**
```
Sam's Club — Sam's Club 1670 W UNIVERSITY DR, Mckinney, TX 75069    $3186
Sam's Club — Sam's Club, 1670 W UNIVERSITY DR, Mckinney, TX 75069   $531
Sam's Club — Sam's Club                                              $114
```

**After:**
```
Sam's Club — Mckinney     $3831
Walmart — Allen           $3297
Walmart — Mckinney        $522
```

### Files changed
- **Edit**: `src/pages/Stats.tsx` — rewrite `calculateStoreSpend` with city extraction and grouping logic

