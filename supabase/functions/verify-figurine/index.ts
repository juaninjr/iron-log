// Iron Log — verifies a figurine-grid click server-side, never revealing
// the correct cell to the client. Deploy via the Supabase dashboard
// (Edge Functions > New function, paste this file) or `supabase functions
// deploy verify-figurine` if you have the CLI linked to the project.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// the Supabase platform for every Edge Function — no manual secrets setup
// needed for those two.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COOLDOWN_MS = 5000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let cell: unknown;
  try {
    ({ cell } = await req.json());
  } catch {
    return json({ error: "invalid request body" }, 400);
  }
  if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 0 || cell > 399) {
    return json({ error: "invalid cell" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  try {
    // Server-side cooldown, independent of any client-side timer: reject
    // if this IP made ANY attempt in the last COOLDOWN_MS.
    const cutoff = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from("figurine_attempts")
      .select("id")
      .eq("ip", ip)
      .gte("attempted_at", cutoff)
      .limit(1);
    if (recentErr) throw recentErr;
    if (recent && recent.length > 0) {
      return json({ error: "cooldown" }, 429);
    }

    const { data: secretRow, error: secretErr } = await supabaseAdmin
      .from("owner_secret")
      .select("correct_cell")
      .eq("id", 1)
      .single();
    if (secretErr) throw secretErr;

    const granted = secretRow.correct_cell === cell;

    const { error: insertErr } = await supabaseAdmin
      .from("figurine_attempts")
      .insert({ ip, success: granted });
    if (insertErr) throw insertErr;

    return json({ granted });
  } catch (e) {
    console.error("verify-figurine error", e);
    return json({ error: "server error" }, 500);
  }
});
