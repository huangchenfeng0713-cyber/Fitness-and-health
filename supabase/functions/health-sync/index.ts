import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-health-sync-token",
  "access-control-allow-methods": "POST,OPTIONS",
};

const numericRanges: Record<string, [number, number]> = {
  steps: [0, 250000],
  activeEnergy: [0, 30000],
  restingEnergy: [0, 10000],
  exerciseMinutes: [0, 1440],
  standMinutes: [0, 1440],
  distanceKm: [0, 1000],
  sleepMinutes: [0, 1440],
  waterMl: [0, 100000],
  weightKg: [1, 500],
  bodyFatPct: [1, 75],
  restingHR: [20, 250],
  vo2max: [5, 120],
};

const aliases: Record<string, string> = {
  steps: "steps", stepcount: "steps", "步数": "steps",
  activeenergy: "activeEnergy", activeenergykcal: "activeEnergy", "活动能量": "activeEnergy",
  restingenergy: "restingEnergy", restingenergykcal: "restingEnergy", basalenergy: "restingEnergy",
  "静息能量": "restingEnergy",
  exerciseminutes: "exerciseMinutes", appleexercisetime: "exerciseMinutes", "锻炼时间": "exerciseMinutes",
  standminutes: "standMinutes", applestandtime: "standMinutes",
  distancekm: "distanceKm", distance: "distanceKm", walkingrunningdistance: "distanceKm", "距离": "distanceKm",
  sleepminutes: "sleepMinutes", sleep: "sleepMinutes", "睡眠": "sleepMinutes",
  waterml: "waterMl", water: "waterMl", "饮水": "waterMl",
  weightkg: "weightKg", weight: "weightKg", bodymass: "weightKg", "体重": "weightKg",
  bodyfatpct: "bodyFatPct", bodyfat: "bodyFatPct", bodyfatpercentage: "bodyFatPct", "体脂率": "bodyFatPct",
  restinghr: "restingHR", restingheartrate: "restingHR", "静息心率": "restingHR",
  vo2max: "vo2max",
};

const measurementAliases: Record<string, string> = {
  weightmeasuredat: "weightMeasuredAt",
  bodyfatmeasuredat: "bodyFatMeasuredAt",
  restinghrmeasuredat: "restingHRMeasuredAt",
  vo2maxmeasuredat: "vo2maxMeasuredAt",
};

const snapshotMetricTimes: Record<string, string> = {
  weightKg: "weightMeasuredAt",
  bodyFatPct: "bodyFatMeasuredAt",
  restingHR: "restingHRMeasuredAt",
  vo2max: "vo2maxMeasuredAt",
};

const envelopeAliases: Record<string, string> = {
  date: "date", timestamp: "timestamp", capturedat: "capturedAt",
  timezone: "timezone", source: "source", syncid: "syncId",
  protocolversion: "protocolVersion",
};

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown> : null;
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
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
  const text = value.trim();
  // Require an unambiguous RFC 3339 instant. Date-only or timezone-less text
  // is interpreted differently by browsers/servers and can shift a daily total.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    return false;
  }
  return Number.isFinite(Date.parse(text));
}

function dateHasTimeComponent(value: unknown) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  const datePrefix = text.match(/^\d{4}-\d{1,2}-\d{1,2}/)?.[0];
  if (datePrefix) {
    const suffix = text.slice(datePrefix.length);
    if (suffix.startsWith("T") || suffix.startsWith("t") || /^\s+\S/.test(suffix)) return true;
  }
  return /[ T]\d{1,2}:\S*/.test(text);
}

function resolveCapturedTimestamp(body: Record<string, unknown>, fallback: string) {
  const capturedAtProvided = hasOwn(body, "capturedAt");
  const timestampProvided = hasOwn(body, "timestamp");
  const dateTimeProvided = dateHasTimeComponent(body.date);
  const providedValues = [
    ...(capturedAtProvided ? [body.capturedAt] : []),
    ...(timestampProvided ? [body.timestamp] : []),
    ...(dateTimeProvided ? [body.date] : []),
  ];
  if (providedValues.some((value) => !validTimestamp(value))) {
    return { ok: false as const, code: "invalid_timestamp" as const };
  }
  if (new Set(providedValues.map((value) => Date.parse(String(value)))).size > 1) {
    return { ok: false as const, code: "timestamp_conflict" as const };
  }
  const capturedAt = capturedAtProvided
    ? String(body.capturedAt)
    : timestampProvided
      ? String(body.timestamp)
      : dateTimeProvided
        ? String(body.date)
        : fallback;
  return { ok: true as const, capturedAt, capturedProvided: providedValues.length > 0 };
}

function missingMeasurementTimeField(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  for (const [metric, measuredKey] of Object.entries(snapshotMetricTimes)) {
    if (payload[metric] == null) continue;
    const measuredAt = body[measuredKey];
    if (measuredAt == null || (typeof measuredAt === "string" && !measuredAt.trim())) {
      return measuredKey;
    }
  }
  return null;
}

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
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
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readLimitedText(req: Request, limit: number) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > limit) throw new Error("payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("payload_too_large");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

function flattenMetrics(value: unknown) {
  const metrics = asObject(value);
  if (!metrics) return {};
  const flat: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(metrics)) {
    const item = asObject(raw);
    flat[key] = item && "value" in item ? item.value : raw;
    if (item?.observedAt) flat[`${key}MeasuredAt`] = item.observedAt;
  }
  return flat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return response(405, { ok: false, code: "method_not_allowed" });

  const token = (req.headers.get("x-health-sync-token") || "").trim();
  if (!/^hds_[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return response(401, { ok: false, code: "invalid_token" });
  }

  let envelope: Record<string, unknown>;
  try {
    const text = await readLimitedText(req, 16 * 1024);
    const parsed = asObject(JSON.parse(text));
    if (!parsed) return response(400, { ok: false, code: "invalid_payload" });
    envelope = parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "payload_too_large") {
      return response(413, { ok: false, code: "payload_too_large" });
    }
    return response(400, { ok: false, code: "invalid_json" });
  }

  const wrapped = asObject(envelope.payload) || {};
  const combined = { ...envelope, ...wrapped, ...flattenMetrics(envelope.metrics) };
  const body: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(combined)) {
    const normalized = normalizeKey(rawKey);
    const key = aliases[normalized] || measurementAliases[normalized]
      || envelopeAliases[normalized] || rawKey.trim();
    body[key] = value;
  }

  const protocolVersion = body.protocolVersion == null ? 1 : Number(body.protocolVersion);
  if (protocolVersion !== 1) return response(400, { ok: false, code: "unsupported_protocol" });

  const timezone = typeof body.timezone === "string" && body.timezone.trim()
    ? body.timezone.trim() : "Asia/Shanghai";
  if (timezone.length > 64) return response(400, { ok: false, code: "invalid_timezone" });
  try { localDateAt(new Date(), timezone); } catch {
    return response(400, { ok: false, code: "invalid_timezone" });
  }

  const capturedResolution = resolveCapturedTimestamp(body, new Date().toISOString());
  if (!capturedResolution.ok) {
    return response(400, { ok: false, code: capturedResolution.code });
  }
  const { capturedAt, capturedProvided } = capturedResolution;
  const captured = new Date(capturedAt);
  if (captured.getTime() > Date.now() + 10 * 60 * 1000) {
    return response(400, { ok: false, code: "future_timestamp" });
  }
  const date = normalizeDate(body.date, captured, timezone);
  const latestDate = localDateAt(new Date(Date.now() + 10 * 60 * 1000), timezone);
  if (!validDateKey(date) || date < "2000-01-01" || date > latestDate) {
    return response(400, { ok: false, code: "invalid_date" });
  }
  if (capturedProvided && localDateAt(captured, timezone) !== date) {
    return response(400, { ok: false, code: "date_timezone_mismatch" });
  }

  const payload: Record<string, unknown> = {};
  const skipped: string[] = [];
  const rejected: string[] = [];
  let metricCount = 0;
  for (const [key, [min, max]] of Object.entries(numericRanges)) {
    let value = body[key];
    if (value == null || value === "") continue;
    if (typeof value === "string" && value.trim()) value = Number(value.trim());
    /*
     * 下限大于 0 的指标（静息心率、体重、体脂率、VO2max）读到 0 表示「今天没有样本」，
     * 不是「测得 0」——活人这几项不可能是 0。
     *
     * 快捷指令里「查找健康样本」找不到样本时，后面的「获取数字」只会产出 0，
     * 这是它唯一能表达的空值。静息心率尤其常见：Apple Watch 通常要等夜间睡眠之后
     * 才算得出当天的值，白天跑一次同步基本都是空的。
     */
    if (value === 0 && min > 0) {
      skipped.push(key);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      /*
       * 一个指标不合法不该毁掉整次上传。
       * 原先这里直接 400，结果白天同步时静息心率是 0，步数、活动能量、静息能量
       * 全都跟着丢掉——用户看到的现象是「步数没读到」，实际是整包被否了。
       * 现在把这一项挑出来，其余照常入库，并在响应里报出来。
       */
      rejected.push(key);
      continue;
    }
    payload[key] = value;
    metricCount += 1;
  }
  if (!metricCount) {
    return response(400, rejected.length
      ? { ok: false, code: "invalid_metric", field: rejected[0], rejected }
      : { ok: false, code: "no_metrics", skipped });
  }

  const missingMeasurementTime = missingMeasurementTimeField(payload, body);
  if (missingMeasurementTime) {
    return response(400, {
      ok: false,
      code: "missing_measurement_time",
      field: missingMeasurementTime,
    });
  }

  for (const [metric, measuredKey] of Object.entries(snapshotMetricTimes)) {
    if (payload[metric] == null) continue;
    if (!validTimestamp(body[measuredKey])) {
      return response(400, { ok: false, code: "invalid_measurement_time", field: measuredKey });
    }
    const measured = new Date(String(body[measuredKey]));
    if (measured.getTime() > Date.now() + 10 * 60 * 1000) {
      return response(400, { ok: false, code: "future_measurement_time", field: measuredKey });
    }
    const measuredDate = localDateAt(measured, timezone);
    if (!validDateKey(measuredDate) || measuredDate < "2000-01-01" || measuredDate > latestDate) {
      return response(400, { ok: false, code: "invalid_measurement_time", field: measuredKey });
    }
    payload[measuredKey] = body[measuredKey];
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return response(500, { ok: false, code: "server_not_configured" });

  const tokenHash = await sha256Hex(token);
  let syncId = typeof body.syncId === "string" ? body.syncId.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(syncId)) {
    syncId = `auto_${(await sha256Hex(`${tokenHash}|${JSON.stringify(combined)}`)).slice(0, 48)}`;
  }
  const source = typeof body.source === "string" && body.source.trim()
    ? body.source.trim().slice(0, 40) : "apple_shortcuts";

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  type IngestJob = {
    kind: string;
    date: string;
    capturedAt: string;
    payload: Record<string, unknown>;
    syncId: string;
  };
  const mainPayload = { ...payload };
  const measurementJobs: IngestJob[] = [];
  for (const [metric, measuredKey] of Object.entries(snapshotMetricTimes)) {
    const measuredAt = mainPayload[measuredKey];
    if (mainPayload[metric] == null || typeof measuredAt !== "string") continue;
    const measuredDate = localDateAt(new Date(measuredAt), timezone);
    if (measuredDate === date) continue;
    measurementJobs.push({
      kind: metric,
      date: measuredDate,
      capturedAt: measuredAt,
      payload: { [metric]: mainPayload[metric], [measuredKey]: measuredAt },
      syncId: `${syncId.slice(0, 106)}:${metric}`,
    });
    delete mainPayload[metric];
    delete mainPayload[measuredKey];
  }

  const hasMainMetric = Object.keys(numericRanges).some((key) => mainPayload[key] != null);
  const jobs: IngestJob[] = [
    ...(hasMainMetric ? [{ kind: "daily", date, capturedAt, payload: mainPayload, syncId }] : []),
    ...measurementJobs,
  ];
  const accepted: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const result = await supabase.rpc("ingest_health_sync", {
      p_token_hash: tokenHash,
      p_sync_id: job.syncId,
      p_captured_at: job.capturedAt,
      p_date: job.date,
      p_timezone: timezone,
      p_source: source,
      p_payload: job.payload,
    });
    if (result.error) {
      console.error("health-sync ingest failed", result.error.code);
      return response(500, { ok: false, code: "ingest_failed" });
    }
    if (!result.data?.ok && result.data?.code === "invalid_token") return response(401, result.data);
    if (!result.data?.ok && result.data?.code === "rate_limited") return response(429, result.data);
    if (!result.data?.ok) return response(500, result.data || { ok: false, code: "empty_result" });
    accepted.push({ ...result.data, kind: job.kind });
  }

  const updatedAt = accepted.map((item) => String(item.updatedAt || ""))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  return response(200, {
    ok: true,
    applied: accepted.some((item) => item.applied === true),
    duplicate: accepted.length > 0 && accepted.every((item) => item.duplicate === true),
    date,
    updatedAt,
    // 让快捷指令的运行结果直接看得到哪几项没进去、为什么：
    // skipped = 今天没有样本（传上来是 0），rejected = 数值超出生理范围
    stored: Object.keys(payload).filter((key) => key in numericRanges),
    skipped,
    rejected,
    measurements: accepted.filter((item) => item.kind !== "daily")
      .map((item) => ({ metric: item.kind, date: item.date, applied: item.applied })),
  });
});
