export type Bias = "up" | "down" | "mixed";

/** Simple moving average. Null until `period` closes exist. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i]! - values[i - period]!;
    out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values. Null until seeded. */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export type MacdSeries = {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
};

/** Classic MACD 12 / 26 / 9. Signal is an EMA of the MACD line. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) => {
    const a = fastEma[i];
    const b = slowEma[i];
    if (a == null || b == null) return null;
    return a - b;
  });

  const defined: number[] = [];
  const indexes: number[] = [];
  macdLine.forEach((value, i) => {
    if (value == null) return;
    defined.push(value);
    indexes.push(i);
  });

  const signalOnDefined = ema(defined, signalPeriod);
  const signal: (number | null)[] = values.map(() => null);
  const hist: (number | null)[] = values.map(() => null);
  signalOnDefined.forEach((value, j) => {
    if (value == null) return;
    const i = indexes[j]!;
    signal[i] = value;
    hist[i] = defined[j]! - value;
  });

  return { macd: macdLine, signal, hist };
}

export function maBias(fast: number | null, mid: number | null, slow: number | null): Bias | null {
  if (fast == null || mid == null || slow == null) return null;
  if (fast > mid && mid > slow) return "up";
  if (fast < mid && mid < slow) return "down";
  return "mixed";
}

/** 9/21 cross on the last closed bar, so the forming candle does not flicker it. */
export function emaCrossLabel(fast: (number | null)[], mid: (number | null)[]): string | null {
  const i = fast.length - 1;
  if (i < 2) return null;
  const prevFast = fast[i - 2];
  const prevMid = mid[i - 2];
  const lastFast = fast[i - 1];
  const lastMid = mid[i - 1];
  if (prevFast == null || prevMid == null || lastFast == null || lastMid == null) return null;
  if (prevFast <= prevMid && lastFast > lastMid) return "Cruce 9/21 alcista";
  if (prevFast >= prevMid && lastFast < lastMid) return "Cruce 9/21 bajista";
  return null;
}
