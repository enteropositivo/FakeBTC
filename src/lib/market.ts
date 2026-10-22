export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "2h", "4h", "1d"] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Ticker = {
  price: number;
  changePct: number;
  high: number;
  low: number;
};

export type FeedStatus = "connecting" | "live" | "polling";

const REST = "https://data-api.binance.vision/api/v3";
const WS_ROOTS = [
  "wss://data-stream.binance.vision/stream",
  "wss://stream.binance.com:9443/stream",
];

function parseCandle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 5) return null;
  const time = Math.floor(Number(row[0]) / 1000);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

export async function fetchKlines(
  timeframe: Timeframe,
  limit = 500,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = `${REST}/klines?symbol=BTCUSDT&interval=${timeframe}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`No se pudieron cargar las velas (${res.status})`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("Respuesta de mercado inválida");
  const byTime = new Map<number, Candle>();
  for (const row of json) {
    const candle = parseCandle(row);
    if (candle) byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export async function fetchTicker(signal?: AbortSignal): Promise<Ticker> {
  const res = await fetch(`${REST}/ticker/24hr?symbol=BTCUSDT`, { signal });
  if (!res.ok) throw new Error(`No se pudo leer el precio (${res.status})`);
  const json: unknown = await res.json();
  if (!json || typeof json !== "object") throw new Error("Ticker inválido");
  const row = json as Record<string, unknown>;
  const price = Number(row.lastPrice);
  const changePct = Number(row.priceChangePercent);
  const high = Number(row.highPrice);
  const low = Number(row.lowPrice);
  if (![price, changePct, high, low].every(Number.isFinite)) throw new Error("Ticker inválido");
  return { price, changePct, high, low };
}

type StreamHandlers = {
  onCandle: (candle: Candle) => void;
  onTicker: (ticker: Ticker) => void;
  onStatus: (status: FeedStatus) => void;
  onResync: () => void;
};

function tickerFromMini(data: Record<string, unknown>): Ticker | null {
  const price = Number(data.c);
  const open = Number(data.o);
  const high = Number(data.h);
  const low = Number(data.l);
  if (![price, open, high, low].every(Number.isFinite) || open === 0) return null;
  return { price, changePct: ((price - open) / open) * 100, high, low };
}

function candleFromKline(data: Record<string, unknown>): Candle | null {
  const k = data.k;
  if (!k || typeof k !== "object") return null;
  const row = k as Record<string, unknown>;
  const time = Math.floor(Number(row.t) / 1000);
  const open = Number(row.o);
  const high = Number(row.h);
  const low = Number(row.l);
  const close = Number(row.c);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

export function subscribeMarket(timeframe: Timeframe, handlers: StreamHandlers): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let pollTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let attempt = 0;
  let hostIndex = 0;
  let opened = false;
  let polling = false;

  const clearPoll = () => {
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    polling = false;
  };

  const pollOnce = async () => {
    try {
      const [klines, ticker] = await Promise.all([fetchKlines(timeframe, 3), fetchTicker()]);
      if (stopped) return;
      handlers.onTicker(ticker);
      for (const candle of klines) handlers.onCandle(candle);
    } catch {
      /* next interval retries */
    }
  };

  const startPoll = () => {
    if (stopped || polling) return;
    polling = true;
    handlers.onStatus("polling");
    void pollOnce();
    pollTimer = window.setInterval(() => void pollOnce(), 3000);
  };

  const connect = () => {
    if (stopped) return;
    handlers.onStatus(polling ? "polling" : "connecting");
    const root = WS_ROOTS[hostIndex % WS_ROOTS.length]!;
    const url = `${root}?streams=btcusdt@kline_${timeframe}/btcusdt@miniTicker`;
    try {
      ws = new WebSocket(url);
    } catch {
      startPoll();
      return;
    }

    ws.onopen = () => {
      if (stopped) return;
      const reconnect = opened;
      opened = true;
      attempt = 0;
      clearPoll();
      handlers.onStatus("live");
      if (reconnect) handlers.onResync();
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || typeof payload !== "object") return;
      const wrapped = payload as { data?: unknown };
      const data = wrapped.data;
      if (!data || typeof data !== "object") return;
      const row = data as Record<string, unknown>;
      if (row.e === "kline") {
        const candle = candleFromKline(row);
        if (candle) handlers.onCandle(candle);
        return;
      }
      if (row.e === "24hrMiniTicker") {
        const ticker = tickerFromMini(row);
        if (ticker) handlers.onTicker(ticker);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onclose = () => {
      if (stopped) return;
      attempt += 1;
      hostIndex += 1;
      if (attempt >= 2) startPoll();
      const delay = Math.min(12_000, 600 * 2 ** Math.min(attempt, 4));
      reconnectTimer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    stopped = true;
    clearPoll();
    if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
    ws?.close();
  };
}
