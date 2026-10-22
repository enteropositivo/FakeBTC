import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDown, ArrowUp, Globe, LoaderCircle } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { IndicatorMenu } from "@/components/indicator-menu";
import { InstallPrompt } from "@/components/install-prompt";
import { formatBarTime, formatClock, formatPct, formatPrice, formatSignedUsd, formatUsd } from "@/lib/format";
import { COPY, LANG_LABEL, LANGS, loadLang, saveLang, type Lang } from "@/lib/i18n";
import { ema, macd, sma } from "@/lib/indicators";
import {
  TIMEFRAMES,
  fetchKlines,
  fetchTicker,
  subscribeMarket,
  type Candle,
  type FeedStatus,
  type Ticker,
  type Timeframe,
} from "@/lib/market";
import { closePosition, LEVERAGE, loadBook, openPosition, saveBook, STARTING_EQUITY, unrealized, type PaperBook } from "@/lib/paper";
import { loadPrefs, savePrefs, type IndicatorId } from "@/lib/prefs";

type Theme = {
  bg: string;
  fg: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  up: string;
  down: string;
  raised: string;
};

type MasSeries = {
  fast: ISeriesApi<"Line">;
  mid: ISeriesApi<"Line">;
  slow: ISeriesApi<"Line">;
};

type MacdSeries = {
  hist: ISeriesApi<"Histogram">;
  macd: ISeriesApi<"Line">;
  signal: ISeriesApi<"Line">;
};

const MA_FAST = 21;
const MA_MID = 55;
const MA_SLOW = 200;

const FALLBACK: Theme = {
  bg: "#100e0c",
  fg: "#f3efe6",
  muted: "#9c9488",
  faint: "#6f675e",
  line: "#2e2924",
  accent: "#f0a202",
  up: "#1f8a5b",
  down: "#d4543c",
  raised: "#241f1b",
};

function readTheme(): Theme {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: keyof Theme) =>
    style.getPropertyValue(`--color-${name}`).trim() || FALLBACK[name];
  return {
    bg: pick("bg"),
    fg: pick("fg"),
    muted: pick("muted"),
    faint: pick("faint"),
    line: pick("line"),
    accent: pick("accent"),
    up: pick("up"),
    down: pick("down"),
    raised: pick("raised"),
  };
}

function toBar(candle: Candle): CandlestickData {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function linePoints(candles: Candle[], values: (number | null)[]): LineData[] {
  const points: LineData[] = [];
  values.forEach((value, i) => {
    if (value == null) return;
    const candle = candles[i];
    if (!candle) return;
    points.push({ time: candle.time as UTCTimestamp, value });
  });
  return points;
}

function histColor(value: number, prev: number | null, theme: Theme): string {
  const rising = prev == null ? value >= 0 : value >= prev;
  if (value >= 0) return rising ? theme.up : "rgba(31, 138, 91, 0.45)";
  return rising ? "rgba(212, 84, 60, 0.5)" : theme.down;
}

function histPoints(candles: Candle[], values: (number | null)[], theme: Theme): HistogramData[] {
  const points: HistogramData[] = [];
  let prev: number | null = null;
  values.forEach((value, i) => {
    if (value == null) return;
    const candle = candles[i];
    if (!candle) return;
    points.push({
      time: candle.time as UTCTimestamp,
      value,
      color: histColor(value, prev, theme),
    });
    prev = value;
  });
  return points;
}

function tickLabel(time: Time, type: TickMarkType): string | null {
  if (typeof time !== "number") return null;
  const date = new Date(time * 1000);
  if (type === TickMarkType.Year) return String(date.getFullYear());
  if (type === TickMarkType.Month) return date.toLocaleDateString("es-ES", { month: "short" });
  if (type === TickMarkType.DayOfMonth) {
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<FeedStatus, string> = {
  live: "En vivo",
  connecting: "Conectando",
  polling: "Cada 3 s",
};

function focusRecent(chart: IChartApi, total: number) {
  const width = chart.paneSize().width || 320;
  const bars = Math.max(28, Math.round(width / 14));
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, total - bars),
    to: total + 3,
  });
}

function markerTime(candles: Candle[], openedAt: number): UTCTimestamp | null {
  if (!candles.length) return null;
  let chosen = candles[0]?.time ?? null;
  for (const candle of candles) {
    if (candle.time <= openedAt) chosen = candle.time;
    else break;
  }
  return chosen == null ? null : (chosen as UTCTimestamp);
}

export function ChartDesk() {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const masRef = useRef<MasSeries | null>(null);
  const smaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<MacdSeries | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const indicatorsRef = useRef<IndicatorId[]>([]);
  const themeRef = useRef<Theme>(FALLBACK);
  const hoveringRef = useRef(false);
  const loadedRef = useRef(false);
  const priceRef = useRef<number | null>(null);
  const sessionRef = useRef<object | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ ticker?: Ticker; updatedAt?: number }>({});
  const positionRef = useRef<PaperBook["position"]>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const [chartReady, setChartReady] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [bookReady, setBookReady] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [indicators, setIndicators] = useState<IndicatorId[]>(["sma"]);
  const [book, setBook] = useState<PaperBook>({ cash: STARTING_EQUITY, position: null });
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [tickDir, setTickDir] = useState<"up" | "down" | "flat">("flat");
  const [ohlc, setOhlc] = useState<Candle | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lang, setLang] = useState<Lang>("es");

  useEffect(() => {
    const prefs = loadPrefs();
    setTimeframe(prefs.timeframe);
    setIndicators(prefs.indicators);
    setPrefsReady(true);
    setBook(loadBook());
    setBookReady(true);
    setLang(loadLang());
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    savePrefs({ timeframe, indicators });
  }, [prefsReady, timeframe, indicators]);

  useEffect(() => {
    if (!bookReady) return;
    saveBook(book);
  }, [book, bookReady]);

  useEffect(() => {
    saveLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    indicatorsRef.current = indicators;
  }, [indicators]);

  positionRef.current = book.position;

  const flushUi = () => {
    const pending = pendingRef.current;
    pendingRef.current = {};
    if (pending.ticker) {
      const prev = priceRef.current;
      if (prev != null) {
        if (pending.ticker.price > prev) setTickDir("up");
        else if (pending.ticker.price < prev) setTickDir("down");
      }
      priceRef.current = pending.ticker.price;
      setTicker(pending.ticker);
    }
    if (pending.updatedAt) setUpdatedAt(pending.updatedAt);
  };

  const scheduleUi = (patch: { ticker?: Ticker; updatedAt?: number }) => {
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushUi();
    });
  };

  const paintIndicators = (mode: "full" | "tail") => {
    const candles = candlesRef.current;
    const theme = themeRef.current;
    const closes = candles.map((candle) => candle.close);
    const last = candles.length - 1;

    if (masRef.current && last >= 0) {
      const fast = ema(closes, MA_FAST);
      const mid = ema(closes, MA_MID);
      const slow = ema(closes, MA_SLOW);
      if (mode === "full") {
        masRef.current.fast.setData(linePoints(candles, fast));
        masRef.current.mid.setData(linePoints(candles, mid));
        masRef.current.slow.setData(linePoints(candles, slow));
      } else {
        const candle = candles[last]!;
        const push = (series: ISeriesApi<"Line">, value: number | null) => {
          if (value == null) return;
          series.update({ time: candle.time as UTCTimestamp, value });
        };
        push(masRef.current.fast, fast[last] ?? null);
        push(masRef.current.mid, mid[last] ?? null);
        push(masRef.current.slow, slow[last] ?? null);
      }
    }

    if (smaRef.current && last >= 0) {
      const line = sma(closes, 21);
      if (mode === "full") {
        smaRef.current.setData(linePoints(candles, line));
      } else {
        const value = line[last];
        const candle = candles[last];
        if (value != null && candle) {
          smaRef.current.update({ time: candle.time as UTCTimestamp, value });
        }
      }
    }

    if (macdRef.current && last >= 0) {
      const osc = macd(closes);
      if (mode === "full") {
        macdRef.current.hist.setData(histPoints(candles, osc.hist, theme));
        macdRef.current.macd.setData(linePoints(candles, osc.macd));
        macdRef.current.signal.setData(linePoints(candles, osc.signal));
      } else {
        const candle = candles[last]!;
        const histValue = osc.hist[last];
        if (histValue != null) {
          const prev = last > 0 ? (osc.hist[last - 1] ?? null) : null;
          macdRef.current.hist.update({
            time: candle.time as UTCTimestamp,
            value: histValue,
            color: histColor(histValue, prev, theme),
          });
        }
        const macdValue = osc.macd[last];
        if (macdValue != null) {
          macdRef.current.macd.update({ time: candle.time as UTCTimestamp, value: macdValue });
        }
        const signalValue = osc.signal[last];
        if (signalValue != null) {
          macdRef.current.signal.update({
            time: candle.time as UTCTimestamp,
            value: signalValue,
          });
        }
      }
    }
  };

  const syncSeries = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const theme = themeRef.current;
    const wantMas = indicatorsRef.current.includes("mas");
    const wantSma = indicatorsRef.current.includes("sma");
    const wantMacd = indicatorsRef.current.includes("macd");
    const priceFormat = { type: "price" as const, precision: 2, minMove: 0.01 };

    if (wantMas && !masRef.current) {
      const line = {
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      } as const;
      masRef.current = {
        fast: chart.addSeries(LineSeries, { ...line, color: theme.up, lineWidth: 2 }),
        mid: chart.addSeries(LineSeries, { ...line, color: theme.accent, lineWidth: 2 }),
        slow: chart.addSeries(LineSeries, { ...line, color: theme.down, lineWidth: 2 }),
      };
    }
    if (!wantMas && masRef.current) {
      chart.removeSeries(masRef.current.fast);
      chart.removeSeries(masRef.current.mid);
      chart.removeSeries(masRef.current.slow);
      masRef.current = null;
    }

    if (wantSma && !smaRef.current) {
      smaRef.current = chart.addSeries(LineSeries, {
        color: theme.accent,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    if (!wantSma && smaRef.current) {
      chart.removeSeries(smaRef.current);
      smaRef.current = null;
    }

    if (wantMacd && !macdRef.current) {
      macdRef.current = {
        hist: chart.addSeries(
          HistogramSeries,
          { priceFormat, priceLineVisible: false, lastValueVisible: false },
          1,
        ),
        macd: chart.addSeries(
          LineSeries,
          {
            color: theme.fg,
            lineWidth: 2,
            priceFormat,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          1,
        ),
        signal: chart.addSeries(
          LineSeries,
          {
            color: theme.accent,
            lineWidth: 1,
            priceFormat,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          1,
        ),
      };
      const panes = chart.panes();
      panes[0]?.setStretchFactor(0.72);
      panes[1]?.setStretchFactor(0.28);
    }
    if (!wantMacd && macdRef.current) {
      chart.removeSeries(macdRef.current.hist);
      chart.removeSeries(macdRef.current.macd);
      chart.removeSeries(macdRef.current.signal);
      macdRef.current = null;
      chart.panes()[0]?.setStretchFactor(1);
    }
  };

  const applyCandle = (candle: Candle) => {
    if (!loadedRef.current || !candleRef.current) return;
    const list = candlesRef.current;
    const last = list[list.length - 1];
    if (!last) {
      list.push(candle);
    } else if (candle.time === last.time) {
      list[list.length - 1] = candle;
    } else if (candle.time > last.time) {
      list.push(candle);
    } else {
      const index = list.findIndex((item) => item.time === candle.time);
      if (index === -1) return;
      list[index] = candle;
      return;
    }

    if (list.length > 1500) {
      candlesRef.current = list.slice(-800);
      candleRef.current.setData(candlesRef.current.map(toBar));
      paintIndicators("full");
    } else {
      candleRef.current.update(toBar(candle));
      candleRef.current.applyOptions({
        priceLineColor: candle.close >= candle.open ? themeRef.current.up : themeRef.current.down,
      });
      paintIndicators("tail");
    }

    if (!hoveringRef.current) setOhlc(candlesRef.current[candlesRef.current.length - 1] ?? candle);
    scheduleUi({ updatedAt: Date.now() });
  };

  const syncPositionMark = () => {
    const series = candleRef.current;
    if (!series) return;
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (!markersRef.current) markersRef.current = createSeriesMarkers(series, []);
    const position = positionRef.current;
    if (!position) {
      markersRef.current.setMarkers([]);
      return;
    }
    const theme = themeRef.current;
    const long = position.side === "long";
    const color = long ? theme.up : theme.down;
    const label = long ? "Long" : "short";
    priceLineRef.current = series.createPriceLine({
      price: position.entry,
      color,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: label,
    });
    const time = markerTime(candlesRef.current, position.openedAt);
    markersRef.current.setMarkers(
      time == null
        ? []
        : [
            {
              time,
              position: long ? "atPriceBottom" : "atPriceTop",
              price: position.entry,
              shape: long ? "arrowUp" : "arrowDown",
              color,
              text: label,
              size: 2,
            },
          ],
    );
  };

  const replaceCandles = (candles: Candle[], zoom: boolean) => {
    const chart = chartRef.current;
    const range = zoom ? null : chart?.timeScale().getVisibleLogicalRange();
    candlesRef.current = candles;
    candleRef.current?.setData(candles.map(toBar));
    const last = candles[candles.length - 1];
    if (last) {
      candleRef.current?.applyOptions({
        priceLineColor: last.close >= last.open ? themeRef.current.up : themeRef.current.down,
      });
    }
    syncSeries();
    paintIndicators("full");
    if (chart) {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
      else focusRecent(chart, candles.length);
    }
    syncPositionMark();
    if (!hoveringRef.current) setOhlc(last ?? null);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const theme = readTheme();
    themeRef.current = theme;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme.bg },
        textColor: theme.muted,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontSize: 11,
        attributionLogo: false,
        panes: {
          separatorColor: theme.line,
          separatorHoverColor: theme.faint,
        },
      },
      grid: {
        vertLines: { color: theme.line },
        horzLines: { color: theme.line },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.faint, labelBackgroundColor: theme.raised },
        horzLine: { color: theme.faint, labelBackgroundColor: theme.raised },
      },
      rightPriceScale: { borderColor: theme.line },
      timeScale: {
        borderColor: theme.line,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        tickMarkFormatter: tickLabel,
      },
      localization: {
        locale: "es-ES",
        priceFormatter: (price: number) => formatPrice(price),
        timeFormatter: (time: Time) => (typeof time === "number" ? formatBarTime(time) : ""),
      },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    candleRef.current = candle;

    const onMove = (param: MouseEventParams) => {
      const series = candleRef.current;
      if (!series || param.time == null || !param.point) {
        hoveringRef.current = false;
        const last = candlesRef.current[candlesRef.current.length - 1];
        if (last) setOhlc(last);
        return;
      }
      const data = param.seriesData.get(series);
      if (!data || !("open" in data) || typeof param.time !== "number") {
        hoveringRef.current = false;
        return;
      }
      hoveringRef.current = true;
      setOhlc({
        time: param.time,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
      });
    };
    chart.subscribeCrosshairMove(onMove);
    setChartReady(true);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      masRef.current = null;
      smaRef.current = null;
      macdRef.current = null;
      markersRef.current = null;
      priceLineRef.current = null;
      loadedRef.current = false;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (!chartReady) return;
    syncSeries();
    paintIndicators("full");
    // Series follow the toggle; candles stay put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, indicators]);

  useEffect(() => {
    if (!chartReady || !prefsReady) return;
    const ac = new AbortController();
    const session = {};
    sessionRef.current = session;
    let unsubscribe = () => {};
    loadedRef.current = false;
    candlesRef.current = [];
    candleRef.current?.setData([]);
    masRef.current?.fast.setData([]);
    masRef.current?.mid.setData([]);
    masRef.current?.slow.setData([]);
    smaRef.current?.setData([]);
    macdRef.current?.hist.setData([]);
    macdRef.current?.macd.setData([]);
    macdRef.current?.signal.setData([]);
    setLoading(true);
    setError(null);
    setStatus("connecting");

    const load = async () => {
      try {
        const [klines, nextTicker] = await Promise.all([
          fetchKlines(timeframe, 500, ac.signal),
          fetchTicker(ac.signal),
        ]);
        if (ac.signal.aborted || sessionRef.current !== session) return;
        replaceCandles(klines, true);
        loadedRef.current = true;
        priceRef.current = nextTicker.price;
        setTicker(nextTicker);
        setUpdatedAt(Date.now());
        setLoading(false);
        unsubscribe = subscribeMarket(timeframe, {
          onCandle: (candle) => {
            if (sessionRef.current !== session) return;
            applyCandle(candle);
          },
          onTicker: (next) => {
            if (sessionRef.current !== session) return;
            scheduleUi({ ticker: next, updatedAt: Date.now() });
          },
          onStatus: (next) => {
            if (sessionRef.current !== session) return;
            setStatus(next);
          },
          onResync: () => {
            void fetchKlines(timeframe, 500)
              .then((klines) => {
                if (ac.signal.aborted || sessionRef.current !== session) return;
                replaceCandles(klines, false);
              })
              .catch(() => {});
          },
        });
      } catch (err) {
        if (ac.signal.aborted) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "No se pudo conectar con el mercado");
      }
    };

    void load();

    return () => {
      sessionRef.current = null;
      ac.abort();
      unsubscribe();
      loadedRef.current = false;
    };
    // replace/apply close over the latest chart refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, prefsReady, timeframe, reloadKey]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!chartReady) return;
    syncPositionMark();
    // The mark follows the open position; candles repaint it on resync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, book.position]);

  const trade = (side: "long" | "short") => {
    const price = pendingRef.current.ticker?.price ?? priceRef.current;
    if (price == null || !(price > 0)) return;
    setBook((current) => {
      if (current.position) {
        if (current.position.side === side) return current;
        return closePosition(current, price);
      }
      return openPosition(current, side, price, Math.floor(Date.now() / 1000));
    });
  };

  const toggleIndicator = (id: IndicatorId) => {
    setIndicators((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      const withoutPair = current.filter((item) => {
        if (id === "mas" && item === "sma") return false;
        if (id === "sma" && item === "mas") return false;
        return true;
      });
      return [...withoutPair, id];
    });
  };

  const changeUp = (ticker?.changePct ?? 0) >= 0;
  const mark = ticker?.price;
  const waitingMark = book.position != null && mark == null;
  const pnl = book.position && mark != null ? unrealized(book.position, mark) : 0;
  const equity = book.cash + pnl;
  if (bookReady && book.position && mark != null && equity <= 0) {
    setBook({ cash: 0, position: null });
  }
  const busted = bookReady && !waitingMark && equity <= 0;
  const flat = book.position == null;
  const buyDisabled = busted || !ticker || (flat ? !(book.cash > 0) : book.position?.side === "long");
  const sellDisabled = busted || !ticker || (flat ? !(book.cash > 0) : book.position?.side === "short");
  const copy = COPY[lang];

  const resetAccount = () => {
    setBook({ cash: STARTING_EQUITY, position: null });
  };

  return (
    <main className="relative flex h-dvh flex-col bg-bg text-fg">
      <header className="shrink-0 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">FakeBTC</p>
            <h1 className="text-sm font-medium text-fg">BTC / USDT</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="inline-flex items-center gap-2 text-xs text-muted" role="status">
              <span className="relative flex size-2" aria-hidden="true">
                {status === "live" ? (
                  <span className="live-ping absolute inline-flex size-full animate-ping rounded-full bg-up opacity-70" />
                ) : null}
                <span
                  className={clsx(
                    "relative inline-flex size-2 rounded-full",
                    status === "live" && "bg-up",
                    status === "polling" && "bg-accent",
                    status === "connecting" && "bg-faint",
                  )}
                />
              </span>
              {STATUS_LABEL[status]}
              {updatedAt ? <span className="font-mono tabular-nums">{formatClock(updatedAt)}</span> : null}
            </p>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Idioma"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-surface text-fg hover:bg-raised"
              >
                <Globe className="size-4" aria-hidden="true" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  side="bottom"
                  sideOffset={8}
                  className="menu-panel z-50 rounded-md bg-surface p-1.5 shadow-pop"
                >
                  {LANGS.map((item) => (
                    <DropdownMenu.Item
                      key={item}
                      onSelect={() => setLang(item)}
                      className={clsx(
                        "cursor-pointer rounded-sm px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-raised",
                        item === lang ? "text-accent" : "text-fg",
                      )}
                    >
                      {LANG_LABEL[item]}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="shrink-0">
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-2xl leading-none font-medium tabular-nums tracking-tight sm:text-3xl">
                {ticker ? formatPrice(ticker.price) : "—"}
              </p>
              {tickDir !== "flat" ? (
                <span className={tickDir === "up" ? "text-up" : "text-down"} aria-hidden="true">
                  {tickDir === "up" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                </span>
              ) : null}
            </div>
            {ticker ? (
              <p
                className={clsx(
                  "mt-1 text-xs font-medium tabular-nums",
                  changeUp ? "text-up" : "text-down",
                )}
              >
                {formatPct(ticker.changePct)}
                <span className="ml-1 font-normal text-muted">24h</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-faint">24h</p>
            )}
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 divide-x divide-line overflow-hidden rounded-md border border-line bg-surface">
            <div className="min-w-0 px-3 py-2">
              <p className="text-xs tracking-wide text-muted uppercase">Equity</p>
              <p className="truncate font-mono text-sm font-medium tabular-nums sm:text-base">
                {waitingMark ? "—" : formatUsd(Math.max(0, equity))}
              </p>
            </div>
            <div className="min-w-0 px-3 py-2">
              <p className="text-xs tracking-wide text-muted uppercase">POS · {LEVERAGE}x</p>
              <p
                className={clsx(
                  "truncate font-mono text-sm font-medium tabular-nums sm:text-base",
                  !waitingMark && pnl > 0 && "text-up",
                  !waitingMark && pnl < 0 && "text-down",
                  (waitingMark || pnl === 0) && "text-fg",
                )}
              >
                {waitingMark ? "—" : formatSignedUsd(pnl)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => trade("long")}
            disabled={buyDisabled}
            aria-label={copy.buy}
            className={clsx(
              "h-11 rounded-md text-sm font-medium",
              buyDisabled ? "bg-surface text-faint" : "bg-up text-fg",
            )}
          >
            {copy.buy}
          </button>
          <button
            type="button"
            onClick={() => trade("short")}
            disabled={sellDisabled}
            aria-label={copy.sell}
            className={clsx(
              "h-11 rounded-md text-sm font-medium",
              sellDisabled ? "bg-surface text-faint" : "bg-down text-fg",
            )}
          >
            {copy.sell}
          </button>
        </div>
      </header>

      {busted ? (
        <div
          className="absolute inset-0 z-40 grid place-items-center bg-bg/80 px-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="margin-call-title"
        >
          <div className="w-full max-w-sm rounded-md border border-line bg-surface p-5 text-center shadow-pop">
            <p id="margin-call-title" className="text-base font-medium text-fg">
              {copy.margin}
            </p>
            <button
              type="button"
              onClick={resetAccount}
              className="mt-4 h-11 w-full rounded-md bg-accent text-sm font-medium text-bg"
            >
              {copy.reset}
            </button>
          </div>
        </div>
      ) : (
        <InstallPrompt copy={copy} />
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" role="img" aria-label="Gráfico de velas de Bitcoin" />
        {loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-bg" role="status">
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <LoaderCircle className="velas-spin size-10 text-accent" aria-hidden="true" />
              <p className="text-sm font-medium text-fg">Cargando gráfico de Bitcoin</p>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 grid place-items-center bg-bg px-6 text-center">
            <div className="max-w-sm">
              <p className="text-base font-medium">Sin datos de mercado</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="mt-4 h-11 rounded-md bg-accent px-4 text-sm font-medium text-bg"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-2 sm:px-5">
        <div
          role="radiogroup"
          aria-label="Marco temporal"
          className="scroll-none flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {TIMEFRAMES.map((item) => {
            const on = item === timeframe;
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTimeframe(item)}
                className={clsx(
                  "h-11 min-w-11 shrink-0 rounded-md px-3 font-mono text-sm tabular-nums",
                  on ? "bg-accent font-medium text-bg" : "bg-surface text-muted hover:text-fg",
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
        <IndicatorMenu active={indicators} onToggle={toggleIndicator} />
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted sm:px-5">
        <p className="font-mono tabular-nums">
          {ohlc ? (
            <>
              <span className="mr-3">{formatBarTime(ohlc.time)}</span>
              O {formatPrice(ohlc.open)} · H {formatPrice(ohlc.high)} · L {formatPrice(ohlc.low)} · C{" "}
              <span className={ohlc.close >= ohlc.open ? "text-up" : "text-down"}>{formatPrice(ohlc.close)}</span>
            </>
          ) : (
            "O — · H — · L — · C —"
          )}
        </p>
        <p className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span>
            Binance spot ·{" "}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-line underline-offset-2 hover:text-fg"
            >
              gráficos TradingView
            </a>
          </span>
          <a
            href="https://x.com/EnteroPositivo"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-fg hover:text-accent"
          >
            <img src="/entero.jpg" alt="" width={16} height={16} className="size-4 rounded-full" />
            By @EnteroPositivo
          </a>
        </p>
      </footer>
    </main>
  );
}
