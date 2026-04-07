import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Pricing table (per 1M tokens) ---
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash-lite": { input: 0.075, output: 0.30 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "google/gemini-3-flash-preview": { input: 0.15, output: 0.60 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10.00 },
};
const DEFAULT_PRICING = { input: 0.50, output: 1.50 };

async function logUsage(supabase: any, userId: string, featureType: string, model: string, inputChars: number, outputChars: number) {
  try {
    const inputTokens = Math.ceil(inputChars / 4);
    const outputTokens = Math.ceil(outputChars / 4);
    const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    await supabase.from("api_usage_logs").insert({
      user_id: userId,
      feature_type: featureType,
      model_used: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    });
  } catch (e) {
    console.error("Failed to log usage:", e);
  }
}

interface AIConfig {
  provider: "anthropic" | "openai" | "google" | "lovable";
  apiKey: string;
  model: string;
}

interface Intent {
  needs_skus: boolean;
  needs_receipts: boolean;
  needs_items: boolean;
  needs_machines: boolean;
  needs_sales: boolean;
  needs_restock: boolean;
  date_filter: string | null;
}

async function fetchAllRows(_table: string, query: any) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

async function getAIConfig(supabase: any, userId: string): Promise<AIConfig> {
  const { data } = await supabase
    .from("ai_provider_settings")
    .select("provider, encrypted_api_key, model, is_default")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    const encKey = Deno.env.get("AI_ENCRYPTION_KEY")!;
    const { data: decrypted } = await supabase.rpc("decrypt_ai_key", {
      encrypted_text: data.encrypted_api_key,
      enc_key: encKey,
    });
    return { provider: data.provider, apiKey: decrypted, model: data.model };
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    return { provider: "lovable", apiKey: lovableKey, model: "google/gemini-2.5-flash-lite" };
  }

  throw new Error("No AI provider configured. Please set one up in Settings → AI Settings.");
}

// --- Regex-based intent detection ---
const MONTH_NAMES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04",
  jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();

  let date_filter: string | null = null;
  const monthYearMatch = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})\b/);
  if (monthYearMatch) {
    date_filter = `${monthYearMatch[2]}-${MONTH_NAMES[monthYearMatch[1]]}`;
  }
  const isoMatch = q.match(/\b(\d{4})-(\d{2})\b/);
  if (!date_filter && isoMatch) {
    date_filter = `${isoMatch[1]}-${isoMatch[2]}`;
  }

  const needs_restock = /\b(restock|inventory|run out|running low|what.*(do|need).*this week|needs? attention|supply|stock up)\b/.test(q);

  const defaultAll: Intent = { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: true, needs_sales: true, needs_restock, date_filter };

  if (/\b(overview|summary|how.?s my business|full analysis|everything|dashboard|report)\b/.test(q)) {
    return defaultAll;
  }

  if (/\b(machine|revenue|vending|cash|credit|collection)\b/.test(q) && !/\b(sku|product|item|bought|purchase|receipt|cost|store)\b/.test(q)) {
    return { needs_skus: false, needs_receipts: false, needs_items: false, needs_machines: true, needs_sales: true, needs_restock, date_filter };
  }

  if (/\b(sku|product|profit|margin|sell price|best seller|worst seller|rebuy)\b/.test(q) && !/\b(machine|revenue|collection)\b/.test(q)) {
    return { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: false, needs_sales: false, needs_restock, date_filter };
  }

  if (/\b(receipt|purchase|bought|spend|spent|store|vendor|sam|walmart|costco)\b/.test(q) && !/\b(machine|revenue)\b/.test(q)) {
    return { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: false, needs_sales: false, needs_restock, date_filter };
  }

  if (needs_restock) {
    return { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: false, needs_sales: false, needs_restock, date_filter };
  }

  return defaultAll;
}

function getDateCutoffs() {
  const now = new Date();
  const receipts90 = new Date(now);
  receipts90.setDate(receipts90.getDate() - 90);
  const sales6mo = new Date(now);
  sales6mo.setMonth(sales6mo.getMonth() - 6);
  return {
    receiptCutoff: receipts90.toISOString().split("T")[0],
    salesCutoff: sales6mo.toISOString().split("T")[0],
  };
}

async function fetchSelectiveContext(supabase: any, userId: string, intent: Intent) {
  const fetches: Promise<any>[] = [];
  const keys: string[] = [];
  const { receiptCutoff, salesCutoff } = getDateCutoffs();

  // Always fetch memories
  fetches.push(fetchAllRows("chip_memories", supabase.from("chip_memories").select("memory_text, created_at").eq("user_id", userId).order("created_at", { ascending: false })));
  keys.push("memories");

  if (intent.needs_skus) {
    fetches.push(fetchAllRows("skus", supabase.from("skus").select("id, sku_name, sell_price, category, rebuy_status, default_is_personal").eq("user_id", userId)));
    keys.push("skus");
  }

  if (intent.needs_receipts) {
    let q = supabase.from("receipts").select("id, vendor, receipt_date, store_location, total, tax, subtotal, item_count").eq("user_id", userId).order("receipt_date", { ascending: false });
    if (intent.date_filter) {
      const [year, month] = intent.date_filter.split("-").map(Number);
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      q = q.gte("receipt_date", start).lt("receipt_date", end);
    } else {
      q = q.gte("receipt_date", receiptCutoff);
    }
    fetches.push(fetchAllRows("receipts", q));
    keys.push("receipts");
  }

  // Always fetch machines + sales for anomaly detection
  fetches.push(fetchAllRows("machines", supabase.from("machines").select("id, name, location").eq("user_id", userId)));
  keys.push("machines");

  let salesQ = supabase.from("machine_sales").select("machine_id, date, cash_amount, credit_amount").eq("user_id", userId).order("date", { ascending: false });
  if (intent.date_filter && intent.needs_sales) {
    const [year, month] = intent.date_filter.split("-").map(Number);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    salesQ = salesQ.gte("date", start).lt("date", end);
  } else {
    salesQ = salesQ.gte("date", salesCutoff);
  }
  fetches.push(fetchAllRows("machine_sales", salesQ));
  keys.push("sales");

  const results = await Promise.all(fetches);
  const ctx: any = { skus: [], receipts: [], items: [], machines: [], sales: [], memories: [] };
  for (let i = 0; i < keys.length; i++) {
    ctx[keys[i]] = results[i];
  }

  // Filter out Failed and Do Not Rebuy SKUs
  if (ctx.skus.length > 0) {
    ctx.skus = ctx.skus.filter((s: any) => s.rebuy_status !== "Failed" && s.rebuy_status !== "Do Not Rebuy");
  }

  // Fetch items separately — filter by receipt IDs we already fetched
  if (intent.needs_items) {
    if (ctx.receipts.length > 0) {
      const receiptIds = ctx.receipts.map((r: any) => r.id);
      const batchSize = 100;
      const allItems: any[] = [];
      for (let i = 0; i < receiptIds.length; i += batchSize) {
        const batch = receiptIds.slice(i, i + batchSize);
        const items = await fetchAllRows("receipt_items",
          supabase.from("receipt_items")
            .select("receipt_id, raw_name, qty, pack_size, line_total, unit_cost, is_personal, sku_id")
            .eq("user_id", userId)
            .in("receipt_id", batch)
        );
        allItems.push(...items);
      }
      ctx.items = allItems;
    } else {
      ctx.items = [];
    }
  }

  return ctx;
}

// --- Anomaly Detection ---
async function computeAnomalies(supabase: any, userId: string, machines: any[], sales: any[], receipts: any[]): Promise<string> {
  const today = new Date().toISOString().split("T")[0];

  // Check which anomalies were already shown today
  const { data: shownToday } = await supabase
    .from("restock_warnings_shown")
    .select("alert_key")
    .eq("user_id", userId)
    .eq("feature_type", "anomaly")
    .eq("shown_date", today);

  const alreadyShown = new Set((shownToday || []).map((r: any) => r.alert_key));

  // If any anomaly was shown today, skip all anomaly detection
  if (alreadyShown.size > 0) return "";

  const alerts: string[] = [];
  const newAlertKeys: string[] = [];
  const now = new Date();

  // --- Check no receipt in 10+ days ---
  if (receipts.length > 0) {
    const maxReceiptDate = receipts.reduce((max: string, r: any) => r.receipt_date > max ? r.receipt_date : max, receipts[0].receipt_date);
    const daysSinceReceipt = Math.floor((now.getTime() - new Date(maxReceiptDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceReceipt >= 10 && !alreadyShown.has("no_receipt")) {
      alerts.push(`⚠️ No new receipt uploaded in ${daysSinceReceipt} days (last: ${maxReceiptDate})`);
      newAlertKeys.push("no_receipt");
    }
  }

  // --- Machine revenue anomalies ---
  // Group sales by week and machine
  const weekOf = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const sunday = new Date(d);
    sunday.setDate(diff);
    return sunday.toISOString().split("T")[0];
  };

  // Per-machine weekly revenue
  for (const machine of machines) {
    const mSales = sales.filter((s: any) => s.machine_id === machine.id);
    if (mSales.length === 0) {
      // Check if machine has had no revenue in 10+ days
      const alertKey = `machine_idle_${machine.id}`;
      if (!alreadyShown.has(alertKey)) {
        alerts.push(`⚠️ ${machine.name} has no revenue logged in the last 6 months`);
        newAlertKeys.push(alertKey);
      }
      continue;
    }

    // Check last sale date
    const maxSaleDate = mSales.reduce((max: string, s: any) => s.date > max ? s.date : max, mSales[0].date);
    const daysSinceSale = Math.floor((now.getTime() - new Date(maxSaleDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceSale >= 10) {
      const alertKey = `machine_idle_${machine.id}`;
      if (!alreadyShown.has(alertKey)) {
        alerts.push(`⚠️ ${machine.name} has had no revenue in ${daysSinceSale} days (last: ${maxSaleDate})`);
        newAlertKeys.push(alertKey);
      }
    }

    // 4-week rolling average
    const weeklyRev: Record<string, number> = {};
    for (const s of mSales) {
      const w = weekOf(s.date);
      weeklyRev[w] = (weeklyRev[w] || 0) + Number(s.cash_amount) + Number(s.credit_amount);
    }
    const weeks = Object.keys(weeklyRev).sort().reverse();
    if (weeks.length >= 5) {
      const currentWeekRev = weeklyRev[weeks[0]] || 0;
      const avgPrior4 = weeks.slice(1, 5).reduce((s, w) => s + (weeklyRev[w] || 0), 0) / 4;
      if (avgPrior4 > 0) {
        const pctChange = (currentWeekRev - avgPrior4) / avgPrior4;
        const alertKey = `machine_rev_${machine.id}`;
        if (Math.abs(pctChange) >= 0.2 && !alreadyShown.has(alertKey)) {
          const emoji = pctChange > 0 ? "📈" : "⚠️";
          const dir = pctChange > 0 ? "up" : "down";
          alerts.push(`${emoji} ${machine.name} revenue is ${dir} ${Math.abs(Math.round(pctChange * 100))}% vs 4-week avg ($${currentWeekRev.toFixed(0)} vs $${avgPrior4.toFixed(0)})`);
          newAlertKeys.push(alertKey);
        }
      }
    }
  }

  // --- Overall revenue anomaly ---
  if (sales.length > 0) {
    const weeklyTotal: Record<string, number> = {};
    for (const s of sales) {
      const w = weekOf(s.date);
      weeklyTotal[w] = (weeklyTotal[w] || 0) + Number(s.cash_amount) + Number(s.credit_amount);
    }
    const weeks = Object.keys(weeklyTotal).sort().reverse();
    if (weeks.length >= 5) {
      const current = weeklyTotal[weeks[0]] || 0;
      const avg4 = weeks.slice(1, 5).reduce((s, w) => s + (weeklyTotal[w] || 0), 0) / 4;
      if (avg4 > 0) {
        const pct = (current - avg4) / avg4;
        if (Math.abs(pct) >= 0.2 && !alreadyShown.has("overall_revenue")) {
          const emoji = pct > 0 ? "📈" : "⚠️";
          const dir = pct > 0 ? "up" : "down";
          alerts.push(`${emoji} Total revenue ${dir} ${Math.abs(Math.round(pct * 100))}% vs 4-week avg ($${current.toFixed(0)} vs $${avg4.toFixed(0)})`);
          newAlertKeys.push("overall_revenue");
        }
      }
    }
  }

  // Log shown anomalies
  if (newAlertKeys.length > 0) {
    const rows = newAlertKeys.map(key => ({
      user_id: userId,
      feature_type: "anomaly",
      alert_key: key,
      shown_date: today,
    }));
    await supabase.from("restock_warnings_shown").insert(rows);
  }

  return alerts.join("\n");
}

// --- Store-Aware Restock Warnings ---
async function computeRestockWarnings(supabase: any, userId: string, skus: any[], items: any[], receipts: any[]): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Check already shown today
  const { data: shownToday } = await supabase
    .from("restock_warnings_shown")
    .select("sku_id")
    .eq("user_id", userId)
    .eq("feature_type", "restock")
    .eq("shown_date", todayStr);

  const alreadyShownSkus = new Set((shownToday || []).map((r: any) => r.sku_id));

  // Build receipt date + vendor + location map
  const receiptMap: Record<string, { date: string; vendor: string; location: string }> = {};
  for (const r of receipts) {
    receiptMap[r.id] = { date: r.receipt_date, vendor: r.vendor, location: r.store_location || "Unknown" };
  }

  // Group items by SKU
  const skuItems: Record<string, { dates: string[]; storeHistory: { vendor: string; location: string; date: string; unitCost: number }[] }> = {};
  
  const activeSkuIds = new Set(skus.map((s: any) => s.id));

  for (const item of items) {
    if (item.is_personal || !item.sku_id || !activeSkuIds.has(item.sku_id)) continue;
    if (alreadyShownSkus.has(item.sku_id)) continue;

    const receipt = receiptMap[item.receipt_id];
    if (!receipt) continue;

    if (!skuItems[item.sku_id]) {
      skuItems[item.sku_id] = { dates: [], storeHistory: [] };
    }

    skuItems[item.sku_id].dates.push(receipt.date);

    const units = (item.qty || 1) * (item.pack_size || 1);
    const unitCost = units > 0 ? Number(item.line_total) / units : 0;
    skuItems[item.sku_id].storeHistory.push({
      vendor: receipt.vendor,
      location: receipt.location,
      date: receipt.date,
      unitCost,
    });
  }

  // Compute warnings
  const warnings: { skuId: string; name: string; lastDate: string; avgInterval: number; predictedDate: Date; storeLine: string }[] = [];

  for (const [skuId, data] of Object.entries(skuItems)) {
    const uniqueDates = [...new Set(data.dates)].sort();
    if (uniqueDates.length < 2) continue;

    // Average interval between purchases
    let totalDays = 0;
    for (let i = 1; i < uniqueDates.length; i++) {
      totalDays += (new Date(uniqueDates[i]).getTime() - new Date(uniqueDates[i - 1]).getTime()) / (1000 * 60 * 60 * 24);
    }
    const avgInterval = totalDays / (uniqueDates.length - 1);
    const lastDate = uniqueDates[uniqueDates.length - 1];
    const predictedDate = new Date(new Date(lastDate).getTime() + avgInterval * 24 * 60 * 60 * 1000);

    // Only warn if predicted restock within 7 days
    const daysUntilRestock = (predictedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilRestock > 7) continue;

    const sku = skus.find((s: any) => s.id === skuId);
    if (!sku) continue;

    // Find best store by most recent unit cost per store
    const storeLatest: Record<string, { date: string; unitCost: number }> = {};
    for (const sh of data.storeHistory) {
      const storeKey = `${sh.vendor}|${sh.location}`;
      if (!storeLatest[storeKey] || sh.date > storeLatest[storeKey].date) {
        storeLatest[storeKey] = { date: sh.date, unitCost: sh.unitCost };
      }
    }

    const stores = Object.entries(storeLatest).map(([key, val]) => ({
      store: key.replace("|", " - "),
      ...val,
    }));
    stores.sort((a, b) => a.unitCost - b.unitCost);

    const best = stores[0];
    let storeLine = `Best: ${best.store} ($${best.unitCost.toFixed(2)}/unit)`;

    // Check if last purchase was at a more expensive store
    const lastPurchaseStore = data.storeHistory.sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastStoreKey = `${lastPurchaseStore.vendor} - ${lastPurchaseStore.location}`;
    if (stores.length > 1 && lastStoreKey !== best.store && lastPurchaseStore.unitCost > best.unitCost) {
      const savings = (lastPurchaseStore.unitCost - best.unitCost).toFixed(2);
      storeLine += ` (save $${savings}/unit vs ${lastStoreKey})`;
    }

    warnings.push({
      skuId,
      name: sku.sku_name,
      lastDate,
      avgInterval: Math.round(avgInterval),
      predictedDate,
      storeLine,
    });
  }

  // Sort by most urgent, limit to 3
  warnings.sort((a, b) => a.predictedDate.getTime() - b.predictedDate.getTime());
  const top3 = warnings.slice(0, 3);

  if (top3.length === 0) return "";

  // Log shown warnings
  const rows = top3.map(w => ({
    user_id: userId,
    feature_type: "restock",
    sku_id: w.skuId,
    shown_date: todayStr,
  }));
  await supabase.from("restock_warnings_shown").insert(rows);

  return top3.map(w => {
    const predStr = w.predictedDate.toISOString().split("T")[0];
    const overdue = w.predictedDate <= today;
    const urgency = overdue ? "⚠️ OVERDUE" : `due ${predStr}`;
    return `- ${w.name}: last bought ${w.lastDate}, avg every ${w.avgInterval} days, ${urgency}. ${w.storeLine}`;
  }).join("\n");
}

function buildSystemPrompt(ctx: any, anomalyText: string, restockText: string): string {
  const sections: string[] = [];

  sections.push(`You are Chip, a friendly and knowledgeable AI assistant for VendingTrackr — a vending machine business management app. You have deep expertise in the vending industry including typical profit margins (30-50%), restocking patterns, seasonal trends, and what good vs bad performance looks like.

Data shown is from the last 90 days for purchases and 6 months for machine revenue. If the user asks about older data, let them know you only have recent data available.`);

  // SKUs
  if (ctx.skus.length > 0) {
    const skuSummary = ctx.skus.map((s: any) =>
      `- ${s.sku_name} | sell: $${s.sell_price ?? "?"} | status: ${s.rebuy_status} | cat: ${s.category ?? "?"} | personal: ${s.default_is_personal}`
    ).join("\n");
    sections.push(`## SKUs (${ctx.skus.length} active products)\n${skuSummary}\n\nNote: SKUs marked as Failed or Do Not Rebuy have been excluded. Do not recommend or analyze them — the user has already moved on from those products.`);
  }

  // Items + SKU profit analysis
  if (ctx.items.length > 0 && ctx.skus.length > 0) {
    const receiptDateMap: Record<string, string> = {};
    for (const r of ctx.receipts) receiptDateMap[r.id] = r.receipt_date;

    const activeSkuIds = new Set(ctx.skus.map((s: any) => s.id));
    const skuCosts: Record<string, { totalCost: number; totalUnits: number; name: string }> = {};
    for (const item of ctx.items) {
      if (item.is_personal || !item.sku_id || !activeSkuIds.has(item.sku_id)) continue;
      if (!skuCosts[item.sku_id]) {
        const sku = ctx.skus.find((s: any) => s.id === item.sku_id);
        skuCosts[item.sku_id] = { totalCost: 0, totalUnits: 0, name: sku?.sku_name ?? item.raw_name };
      }
      skuCosts[item.sku_id].totalCost += Number(item.line_total) || 0;
      skuCosts[item.sku_id].totalUnits += (item.qty || 1) * (item.pack_size || 1);
    }

    const skuProfitLines = Object.entries(skuCosts).map(([skuId, data]) => {
      const sku = ctx.skus.find((s: any) => s.id === skuId);
      const sellPrice = sku?.sell_price ? Number(sku.sell_price) : null;
      const avgCostPerUnit = data.totalUnits > 0 ? data.totalCost / data.totalUnits : null;
      const profitPerUnit = sellPrice && avgCostPerUnit ? (sellPrice - avgCostPerUnit).toFixed(2) : "?";
      return `- ${data.name}: ${data.totalUnits} units bought, avg cost/unit $${avgCostPerUnit?.toFixed(2) ?? "?"}, sell $${sellPrice ?? "?"}, profit/unit $${profitPerUnit}`;
    }).join("\n");

    if (skuProfitLines) sections.push(`## SKU Profit Analysis\n${skuProfitLines}`);

    const purchaseDetail = ctx.items.map((item: any) => {
      const date = receiptDateMap[item.receipt_id] ?? "?";
      const units = (item.qty || 1) * (item.pack_size || 1);
      return `- ${date} | ${item.raw_name} | qty: ${item.qty}, pack: ${item.pack_size ?? 1}, units: ${units}, cost: $${item.line_total}, personal: ${item.is_personal}`;
    }).join("\n");
    sections.push(`## Purchase Detail (${ctx.items.length} line items)\n${purchaseDetail}`);
  }

  // Receipts
  if (ctx.receipts.length > 0) {
    const receiptLines = ctx.receipts.map((r: any) =>
      `- ${r.receipt_date} | ${r.vendor} | ${r.store_location ?? "?"} | total: $${r.total ?? "?"} | items: ${r.item_count ?? "?"}`
    ).join("\n");
    sections.push(`## Receipts (${ctx.receipts.length} total)\n${receiptLines}`);
  }

  // Machines & Sales
  if (ctx.machines.length > 0) {
    const machineSummary = ctx.machines.map((m: any) => {
      const mSales = ctx.sales.filter((s: any) => s.machine_id === m.id);
      const totalRev = mSales.reduce((sum: number, s: any) => sum + Number(s.cash_amount) + Number(s.credit_amount), 0);
      const salesLines = mSales.map((s: any) => {
        const cash = Number(s.cash_amount);
        const credit = Number(s.credit_amount);
        return `  - ${s.date}: cash $${cash.toFixed(2)}, credit $${credit.toFixed(2)}, total $${(cash + credit).toFixed(2)}`;
      }).join("\n");
      return `- ${m.name} (${m.location ?? "?"}):\n${salesLines || "  No sales logged."}\n  Summary: ${mSales.length} entries, total revenue $${totalRev.toFixed(2)}`;
    }).join("\n");
    sections.push(`## Machines & Revenue\n${machineSummary}`);
  }

  const memorySummary = ctx.memories.length > 0
    ? ctx.memories.map((m: any) => `- ${m.memory_text}`).join("\n")
    : "No saved memories yet.";
  sections.push(`## Chip's Saved Memories\n${memorySummary}`);

  // Anomaly alerts
  if (anomalyText) {
    sections.push(`## Anomaly Alerts (append after your answer)\n${anomalyText}\nAppend these alerts AFTER your main answer, separated by a blank line. Present them exactly as shown.`);
  }

  // Restock predictions
  if (restockText) {
    sections.push(`## Restock Predictions\n${restockText}\nLead with the most urgent restock warning. Include all details shown: product name, dates, interval, store recommendation, and price.`);
  }

  sections.push(`## Response Format (STRICT — follow exactly)
1. Lead with ONE bold sentence: the single most important insight or answer.
2. Follow with up to 3 short bullet points. Each MUST contain a specific number or dollar figure.
3. NO section headers. NO nested lists. NO tables unless explicitly asked.
4. End with one short actionable recommendation starting with "→".
5. Keep total response under 100 words. It must fit on one phone screen.
6. When answering about profit: profit = (sell_price × units) - cost.
7. Proactively compare time periods when relevant (e.g. "up 12% from last month").
8. Reference saved memories when relevant.
9. If you lack data, say so in one sentence.
10. Today's date is ${new Date().toISOString().split("T")[0]}.`);

  return sections.join("\n\n");
}

async function streamWithLovable(apiKey: string, model: string, messages: any[]) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error(`AI gateway error: ${res.status}`);
  }
  return res;
}

async function streamWithAnthropic(apiKey: string, model: string, messages: any[]) {
  const systemMsg = messages.find((m: any) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m: any) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages: userMsgs, stream: true }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  return res;
}

async function streamWithOpenAI(apiKey: string, model: string, messages: any[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  return res;
}

async function streamWithGoogle(apiKey: string, model: string, messages: any[]) {
  const systemMsg = messages.find((m: any) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m: any) => m.role !== "system").map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemMsg }] },
      contents: userMsgs,
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`Google error: ${res.status}`);
  }
  return res;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, receipt_context } = await req.json();

    let systemPrompt: string;
    let aiConfig: AIConfig;

    if (receipt_context) {
      // --- Receipt summary mode: skip normal data fetching ---
      aiConfig = await getAIConfig(supabase, user.id);

      // Fetch previous purchases for price comparison
      const skuIds = (receipt_context.items || [])
        .filter((i: any) => i.sku_id)
        .map((i: any) => i.sku_id);

      let priceComparisons = "";
      if (skuIds.length > 0) {
        const { data: prevItems } = await supabase
          .from("receipt_items")
          .select("sku_id, unit_cost, receipt_id, receipts!inner(receipt_date, store_location, vendor)")
          .in("sku_id", skuIds)
          .neq("receipt_id", receipt_context.receipt_id)
          .order("created_at", { ascending: false })
          .limit(200);

        if (prevItems && prevItems.length > 0) {
          const skuPrev: Record<string, { store: string; unit_cost: number; date: string }[]> = {};
          for (const pi of prevItems) {
            if (!pi.unit_cost || !pi.receipts) continue;
            const r = pi.receipts as any;
            if (!skuPrev[pi.sku_id]) skuPrev[pi.sku_id] = [];
            skuPrev[pi.sku_id].push({
              store: `${r.vendor} - ${r.store_location || "?"}`,
              unit_cost: Number(pi.unit_cost),
              date: r.receipt_date,
            });
          }
          const lines: string[] = [];
          for (const [sid, history] of Object.entries(skuPrev)) {
            const item = receipt_context.items.find((i: any) => i.sku_id === sid);
            if (!item) continue;
            const prev = history[0];
            lines.push(`- ${item.name}: previously $${prev.unit_cost.toFixed(2)}/unit at ${prev.store} (${prev.date}), now $${item.unit_cost?.toFixed(2) ?? "?"}/unit`);
          }
          if (lines.length > 0) priceComparisons = "\n## Price Comparisons\n" + lines.join("\n");
        }
      }

      // Check for overdue restocks among items on this receipt
      let restockFlags = "";
      if (skuIds.length > 0) {
        const { data: skuData } = await supabase
          .from("skus")
          .select("id, sku_name, sell_price, rebuy_status")
          .in("id", skuIds)
          .not("rebuy_status", "in", '("Failed","Do Not Rebuy")');

        // We don't need full restock calc here — just note if any items exist
        if (skuData) {
          restockFlags = ""; // Chip will infer from the data
        }
      }

      // Build items detail
      const itemLines = (receipt_context.items || []).map((i: any) => {
        const units = (i.qty || 1) * (i.pack_size || 1);
        const profit = i.sell_price && i.unit_cost
          ? ((i.sell_price * units) - i.line_total).toFixed(2)
          : "?";
        return `- ${i.name}: qty ${i.qty}, pack ${i.pack_size || 1}, ${units} units, cost $${Number(i.line_total).toFixed(2)}, unit cost $${i.unit_cost?.toFixed(2) ?? "?"}, sell $${i.sell_price ?? "?"}, est profit $${profit}`;
      }).join("\n");

      const totalProfit = (receipt_context.items || []).reduce((sum: number, i: any) => {
        if (!i.sell_price || !i.unit_cost) return sum;
        const units = (i.qty || 1) * (i.pack_size || 1);
        return sum + (i.sell_price * units - Number(i.line_total));
      }, 0);

      systemPrompt = `You are Chip, a friendly vending business assistant for VendingTrackr.

The user just uploaded a receipt. Provide a conversational "trip summary."

## Receipt Details
- Store: ${receipt_context.store_name || "Unknown"}
- Date: ${receipt_context.receipt_date || "Unknown"}
- Total: $${receipt_context.total ?? "?"}
- Items parsed: ${receipt_context.item_count || receipt_context.items?.length || 0}
- Estimated total profit: $${totalProfit.toFixed(2)}

## Items
${itemLines}
${priceComparisons}

## Response Format (STRICT)
1. Lead with ONE bold sentence about the trip (e.g. estimated profit, total spend).
2. Max 3 bullets with specific dollar figures — highlight: highest margin item, any price changes from previous purchases, or a notable find.
3. End with one "→" recommendation.
4. Under 100 words. Fits one phone screen.
5. Today's date is ${new Date().toISOString().split("T")[0]}.`;

    } else {
      // --- Normal chat mode ---
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
      const intent = detectIntent(lastUserMsg);

      console.log("Intent detection (regex):", JSON.stringify(intent));

      const [config, ctx] = await Promise.all([
        getAIConfig(supabase, user.id),
        fetchSelectiveContext(supabase, user.id, intent),
      ]);
      aiConfig = config;

      const anomalyText = await computeAnomalies(supabase, user.id, ctx.machines, ctx.sales, ctx.receipts);
      const restockText = intent.needs_restock
        ? await computeRestockWarnings(supabase, user.id, ctx.skus, ctx.items, ctx.receipts)
        : "";

      systemPrompt = buildSystemPrompt(ctx, anomalyText, restockText);
    }

    // Trim conversation history to last 6 messages
    const trimmedMessages = messages.length > 6 ? messages.slice(-6) : messages;
    const fullMessages = [{ role: "system", content: systemPrompt }, ...trimmedMessages];

    const inputChars = fullMessages.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);

    let streamRes: Response;

    if (aiConfig.provider === "lovable") {
      streamRes = await streamWithLovable(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else if (aiConfig.provider === "anthropic") {
      streamRes = await streamWithAnthropic(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else if (aiConfig.provider === "openai") {
      streamRes = await streamWithOpenAI(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else if (aiConfig.provider === "google") {
      streamRes = await streamWithGoogle(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else {
      throw new Error("Unsupported provider");
    }

    const wrapStreamWithLogging = (originalStream: ReadableStream<Uint8Array>, transformFn?: (line: string, controller: ReadableStreamDefaultController) => string | null) => {
      const reader = originalStream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let outputChars = 0;

      return new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            logUsage(supabase, user!.id, "chip_chat", aiConfig.model, inputChars, outputChars);
            return;
          }
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              if (transformFn) {
                const content = transformFn(jsonStr, controller);
                if (content) outputChars += content.length;
              } else {
                const evt = JSON.parse(jsonStr);
                const content = evt.choices?.[0]?.delta?.content;
                if (content) outputChars += content.length;
                controller.enqueue(encoder.encode(`data: ${jsonStr}\n\n`));
              }
            } catch {}
          }
        },
      });
    };

    if (aiConfig.provider === "anthropic") {
      const stream = wrapStreamWithLogging(streamRes.body!, (jsonStr, controller) => {
        const evt = JSON.parse(jsonStr);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: evt.delta.text } }] })}\n\n`));
          return evt.delta.text;
        }
        return null;
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    if (aiConfig.provider === "google") {
      const stream = wrapStreamWithLogging(streamRes.body!, (jsonStr, controller) => {
        const evt = JSON.parse(jsonStr);
        const content = evt.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
          return content;
        }
        return null;
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    const stream = wrapStreamWithLogging(streamRes.body!);
    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chip-chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
