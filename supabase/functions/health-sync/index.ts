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

const metricAliases: Record<string, string> = {
  weight: "weightKg",
  activeEnergyKcal: "activeEnergy",
  restingEnergyKcal: "restingEnergy",
  distance: "distanceKm",
  bodyFat: "bodyFatPct",
  restingHeartRate: "restingHR",
};

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

function normalizeDate(value: unknown, captured: Date, timezone: string) {
  if (typeof value === "string") {
    const text = value.trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[ T])/);
    if (!match) match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) return localDateAt(new Date(parsed), timezone);
  }
  return localDateAt(captured, timezone);
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, unknown>;
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

  let envelope: Record<string, unknown>;
  try {
    const parsed = await req.json();
    const object = asObject(parsed);
    if (!object) return json(400, { ok: false, code: "invalid_payload" });
    envelope = object;
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }

  // Shortcuts may send the existing health dictionary directly, or wrap it once
  // as { payload: <dictionary> }. Both forms are accepted.
  const wrapped = asObject(envelope.payload);
  const raw = wrapped || envelope;
  const body: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(raw)) {
    const trimmedKey = rawKey.trim();
    body[metricAliases[trimmedKey] || trimmedKey] = value;
  }

  const protocolVersion = body.protocolVersion == null ? 1 : Number(body.protocolVersion);
  if (protocolVersion !== 1) return json(400, { ok: false, code: "unsupported_protocol" });

  const timezone = typeof body.timezone === "string" && body.timezone.trim()
    ? body.timezone.trim()
    : "Asia/Shanghai";
  try {
    localDateAt(new Date(), timezone);
  } catch {
    return json(400, { ok: false, code: "invalid_timezone" });
  }

  const capturedProvided = validTimestamp(body.capturedAt);
  const capturedAt = capturedProvided ? String(body.capturedAt) : new Date().toISOString();
  const captured = new Date(capturedAt);
  const date = normalizeDate(body.date, captured, timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(400, { ok: false, code: "invalid_date" });
  }
  if (capturedProvided && localDateAt(captured, timezone) !== date) {
    return json(400, { ok: false, code: "date_timezone_mismatch" });
  }

  const payload: Record<string, unknown> = {};
  let metricCount = 0;
  for (const [key, [min, max]] of Object.entries(numericRanges)) {
    let value = body[key];
    if (value == null || value === "") continue;
    if (typeof value === "string" && value.trim() !== "") value = Number(value.trim());
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      return json(400, { ok: false, code: "invalid_metric", field: key });
    }
    payload[key] = value;
    metricCount += 1;
  }
  if (!metricCount) return json(400, { ok: false, code: "no_metrics" });

  for (const key of ["weightMeasuredAt", "bodyFatMeasuredAt", "restingHRMeasuredAt", "vo2maxMeasuredAt"]) {
    if (body[key] == null || body[key] === "") continue;
    if (!validTimestamp(body[key])) {
      return json(400, { ok: false, code: "invalid_measurement_time", field: key });
    }
    payload[key] = body[key];
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(500, { ok: false, code: "server_not_configured" });

  const tokenHash = await sha256Hex(token);
  let syncId = typeof body.syncId === "string" ? body.syncId.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(syncId)) {
    // Deterministic fallback: an identical Shortcut payload becomes the same
    // idempotency key, while changed health values produce a new one.
    syncId = `auto_${(await sha256Hex(`${tokenHash}|${JSON.stringify(raw)}`)).slice(0, 48)}`;
  }

  const source = typeof body.source === "string" && body.source.trim().length <= 40
    ? body.source.trim()
    : "apple_shortcuts";

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("ingest_health_sync", {
    p_token_hash: tokenHash,
    p_sync_id: syncId,
    p_captured_at: capturedAt,
    p_date: date,
    p_timezone: timezone,
    p_source: source,
    p_payload: payload,
  });

  if (error) {
    console.error("health-sync ingest failed", error);
    return json(500, { ok: false, code: "ingest_failed" });
  }
  if (!data?.ok && data?.code === "invalid_token") return json(401, data);
  return json(200, data || { ok: false, code: "empty_result" });
});
