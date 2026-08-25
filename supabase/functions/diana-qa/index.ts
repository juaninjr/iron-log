// Knife (Iron Log) — Diana's security-question gate, server-side. One
// function, two request shapes, mirroring verify-figurine's structure:
//   POST {}                 -> { id, question } for one random row from
//                              diana_qa (the answer itself is never sent).
//   POST { id, answer }     -> { granted } — checks that answer against
//                              the stored one for that question id,
//                              trimmed and case-insensitive, rate-limited
//                              the same way verify-figurine is.
// Deploy via the Supabase dashboard (Edge Functions > New function, paste
// this file) or `supabase functions deploy diana-qa` if you have the CLI
// linked to the project.
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid request body" }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hasAnswer = typeof body.id !== "undefined" || typeof body.answer !== "undefined";

  // ---------- Fetch a random question (no rate limit — asking for a
  // question isn't a guess, only submitting an answer is) ----------
  if (!hasAnswer) {
    try {
      const { data, error } = await supabaseAdmin
        .from("diana_qa")
        .select("id, question");
      if (error) throw error;
      if (!data || data.length === 0) return json({ error: "no questions configured" }, 500);
      const pick = data[Math.floor(Math.random() * data.length)];
      return json({ id: pick.id, question: pick.question });
    } catch (e) {
      console.error("diana-qa question fetch error", e);
      return json({ error: "server error" }, 500);
    }
  }

  // ---------- Verify an answer ----------
  const { id, answer } = body;
  if (typeof id !== "number" || !Number.isInteger(id) || typeof answer !== "string") {
    return json({ error: "invalid request" }, 400);
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  try {
    // Server-side cooldown, independent of any client-side timer — same
    // pattern as verify-figurine, kept in its own table (diana_qa_attempts)
    // since this is a different step in the flow.
    const cutoff = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { data: recent, error: recentErr } = await supabaseAdmin
      .from("diana_qa_attempts")
      .select("id")
      .eq("ip", ip)
      .gte("attempted_at", cutoff)
      .limit(1);
    if (recentErr) throw recentErr;
    if (recent && recent.length > 0) {
      return json({ error: "cooldown" }, 429);
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("diana_qa")
      .select("answer")
      .eq("id", id)
      .maybeSingle();
    if (rowErr) throw rowErr;

    const granted = Boolean(row) && row!.answer.trim().toLowerCase() === answer.trim().toLowerCase();

    const { error: insertErr } = await supabaseAdmin
      .from("diana_qa_attempts")
      .insert({ ip, success: granted });
    if (insertErr) throw insertErr;

    return json({ granted });
  } catch (e) {
    console.error("diana-qa verify error", e);
    return json({ error: "server error" }, 500);
  }
});
