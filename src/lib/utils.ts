import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Clean up store display names where name and city/location are identical.
 * e.g. "Amazon.com — Amazon.com" → "Amazon.com"
 *      "Walmart — Walmart" → "Walmart"
 */
export function cleanStoreDisplay(label: string): string {
  const dashIdx = label.indexOf(" — ");
  if (dashIdx === -1) return label;
  const left = label.substring(0, dashIdx).trim();
  const right = label.substring(dashIdx + 3).trim();
  // If both sides are the same (case-insensitive), or one contains the other
  if (left.toLowerCase() === right.toLowerCase()) {
    return left;
  }
  // Strip ".com" etc. for comparison
  const normalizeForCompare = (s: string) => s.toLowerCase().replace(/\.com$/, "").replace(/[^a-z0-9]/g, "");
  if (normalizeForCompare(left) === normalizeForCompare(right)) {
    return left;
  }
  return label;
}
