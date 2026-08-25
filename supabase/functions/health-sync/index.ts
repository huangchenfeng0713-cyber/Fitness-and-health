import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-health-sync-token",
  "access-control-allow-methods": "POST,OPTIONS",
};

const numericRanges: Record<string, [number, number]> = {
  steps: [0, 200000],
  activeEnergy: [0, 20000],
  restingEnergy: [0, 10000],
  exerciseMinutes: [0, 1440],
  standMinutes: [0, 1440],
  distanceKm: [0, 500],
  sleepMinutes: [0, 1440],
  waterMl: [0, 30000],
  weightKg: [20, 400],
  bodyFatPct: [1, 80],
  restingHR: [25, 220],
  vo2max: [5, 100],
};

const allowedKeys = new Set([
  "protocolVersion", "syncId", "capturedAt", "date", "timezone", "source",
  ...Object.keys(numericRanges),
  "weightMeasuredAt", "bodyFatMeasuredAt", "restingHRMeasuredAt", "vo2maxMeasuredAt",
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function localDateAt(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validTimestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 64) return false;
  return Number.isFinite(Date.parse(value));
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 16 * 1024) return json(413, { ok: false, code: "payload_too_large" });

  const token = (req.headers.get("x-health-sync-token") || "").trim();
  if (!/^hds_[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return json(401, { ok: false, code: "invalid_token" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    return json(400, { ok: false, code: "invalid_payload" });
  }
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) return json(400, { ok: false, code: "unknown_field", field: key });
  }
  if (body.protocolVersion !== 1) return json(400, { ok: false, code: "unsupported_protocol" });
  if (typeof body.syncId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(body.syncId)) {
    return json(400, { ok: false, code: "invalid_sync_id" });
  }
  if (!validTimestamp(body.capturedAt)) return json(400, { ok: false, code: "invalid_captured_at" });
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return json(400, { ok: false, code: "invalid_date" });
  }
  if (typeof body.timezone !== "string" || body.timezone.length > 64) {
    return json(400, { ok: false, code: "invalid_timezone" });
  }
  const captured = new Date(body.capturedAt as string);
  try {
    if (localDateAt(captured, body.timezone) !== body.date) {
      return json(400, { ok: false, code: "date_timezone_mismatch" });
    }
  } catch {
    return json(400, { ok: false, code: "invalid_timezone" });
  }

  let metricCount = 0;
  for (const [key, [min, max]] of Object.entries(numericRanges)) {
    const value = body[key];
    if (value == null || value === "") continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      return json(400, { ok: false, code: "invalid_metric", field: key });
    }
    metricCount += 1;
  }
  if (!metricCount) return json(400, { ok: false, code: "no_metrics" });

  for (const key of ["weightMeasuredAt", "bodyFatMeasuredAt", "restingHRMeasuredAt", "vo2maxMeasuredAt"]) {
    if (body[key] != null && !validTimestamp(body[key])) {
      return json(400, { ok: false, code: "invalid_measurement_time", field: key });
    }
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(500, { ok: false, code: "server_not_configured" });

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tokenHash = await sha256Hex(token);
  const payload = Object.fromEntries(
    Object.entries(body).filter(([key]) => key in numericRanges || key.endsWith("MeasuredAt")),
  );
  const { data, error } = await supabase.rpc("ingest_health_sync", {
    p_token_hash: tokenHash,
    p_sync_id: body.syncId,
    p_captured_at: body.capturedAt,
    p_date: body.date,
    p_timezone: body.timezone,
    p_source: typeof body.source === "string" && body.source.length <= 40 ? body.source : "apple_shortcuts",
    p_payload: payload,
  });

  if (error) {
    console.error("health-sync ingest failed", error);
    return json(500, { ok: false, code: "ingest_failed" });
  }
  if (!data?.ok && data?.code === "invalid_token") return json(401, data);
  return json(200, data || { ok: false, code: "empty_result" });
});
