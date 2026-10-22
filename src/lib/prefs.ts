import { TIMEFRAMES, type Timeframe } from "@/lib/market";

export const INDICATORS = ["sma", "mas", "macd"] as const;
export type IndicatorId = (typeof INDICATORS)[number];

export type Prefs = {
  timeframe: Timeframe;
  indicators: IndicatorId[];
};

const KEY = "velas.prefs.v3";

const DEFAULTS: Prefs = { timeframe: "5m", indicators: ["sma"] };

function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === "string" && (TIMEFRAMES as readonly string[]).includes(value);
}

function isIndicator(value: unknown): value is IndicatorId {
  return value === "sma" || value === "mas" || value === "macd";
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const row = parsed as Record<string, unknown>;
    const indicators = Array.isArray(row.indicators) ? row.indicators.filter(isIndicator) : [];
    return {
      timeframe: isTimeframe(row.timeframe) ? row.timeframe : DEFAULTS.timeframe,
      indicators,
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota */
  }
}
