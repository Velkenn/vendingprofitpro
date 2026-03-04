import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const seedSkus = [
  { sku_name: "Pepsi (12 oz can)", sell_price: 1.00, category: "Drinks" },
  { sku_name: "Lipton Brisk (12 oz can)", sell_price: 1.00, category: "Drinks" },
  { sku_name: "Milo's Sweet Tea (20 oz)", sell_price: 3.00, category: "Drinks" },
  { sku_name: "Hiland Chocolate Milk (16 oz)", sell_price: 3.00, category: "Drinks" },
  { sku_name: "Nesquik Chocolate Milk (14 oz)", sell_price: 3.00, category: "Drinks" },
  { sku_name: "Prairie Farms Iced Coffee", sell_price: 4.00, category: "Drinks" },
  { sku_name: "Starbucks Tripleshot Energy Coffee", sell_price: 5.00, category: "Drinks" },
  { sku_name: "Rockstar Energy (16 oz)", sell_price: 4.00, category: "Drinks" },
  { sku_name: "Alani Nu Energy (12 oz)", sell_price: 5.00, category: "Drinks" },
  { sku_name: "Red Bull – Original", sell_price: 5.00, category: "Drinks" },
  { sku_name: "Red Bull – Blue Edition", sell_price: 5.00, category: "Drinks" },
  { sku_name: "Red Bull – Yellow Edition", sell_price: 5.00, category: "Drinks" },
  { sku_name: "Monster – Ultra Blue", sell_price: 4.00, category: "Drinks" },
  { sku_name: "Celsius Energy", sell_price: 4.00, category: "Drinks" },
  { sku_name: "Bloom Energy", sell_price: 4.00, category: "Drinks" },
  { sku_name: "Uncrustables – PB&Grape", sell_price: 2.00, category: "Food" },
  { sku_name: "Uncrustables – PB&Strawberry", sell_price: 2.00, category: "Food" },
  { sku_name: "Lunchables – Turkey & Cheddar", sell_price: 4.00, category: "Food" },
  { sku_name: "Lunchables – Ham & Swiss", sell_price: 4.00, category: "Food" },
  { sku_name: "Oscar Mayer Bites", sell_price: 5.00, category: "Food" },
  { sku_name: "Hillshire Snack Packs", sell_price: 5.00, category: "Food" },
  { sku_name: "Jack Link's Linkwich", sell_price: 4.00, category: "Food" },
  { sku_name: "Marketside Sub Sandwich", sell_price: 8.00, category: "Food" },
  { sku_name: "OH SNAP Pickles", sell_price: 4.00, category: "Food" },
  { sku_name: "String Cheese", sell_price: 2.50, category: "Food" },
  { sku_name: "M&M Theater Box", sell_price: 3.00, category: "Candy/Snacks" },
  { sku_name: "Reese's Pieces", sell_price: 3.00, category: "Candy/Snacks" },
  { sku_name: "SweeTARTS", sell_price: 3.00, category: "Candy/Snacks" },
  { sku_name: "Breath Savers", sell_price: 2.00, category: "Candy/Snacks" },
  { sku_name: "Hershey Bar", sell_price: 2.00, category: "Candy/Snacks" },
  { sku_name: "Reese's Cups", sell_price: 2.00, category: "Candy/Snacks" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    // Check if user already has SKUs
    const { count } = await supabase
      .from("skus")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (count && count > 0) {
      return new Response(JSON.stringify({ message: "SKUs already seeded", count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert seed SKUs
    const skusToInsert = seedSkus.map((s) => ({
      ...s,
      user_id: user.id,
      rebuy_status: "Rebuy" as const,
    }));

    const { error } = await supabase.from("skus").insert(skusToInsert);
    if (error) throw error;

    // Also create user_settings
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      week_start_day: 0,
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ message: "Seeded", count: seedSkus.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed-skus error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
