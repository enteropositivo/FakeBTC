export const STARTING_EQUITY = 1000;
export const LEVERAGE = 100;

const KEY = "velas.paper.v1";

export type Side = "long" | "short";

export type PaperPosition = {
  side: Side;
  entry: number;
  qty: number;
  openedAt: number;
};

export type PaperBook = {
  cash: number;
  position: PaperPosition | null;
};

const FRESH: PaperBook = { cash: STARTING_EQUITY, position: null };

function isSide(value: unknown): value is Side {
  return value === "long" || value === "short";
}

export function unrealized(position: PaperPosition | null, price: number): number {
  if (!position || !(price > 0)) return 0;
  const diff = position.side === "long" ? price - position.entry : position.entry - price;
  return diff * position.qty * LEVERAGE;
}

export function loadBook(): PaperBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FRESH;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return FRESH;
    const row = parsed as Record<string, unknown>;
    const cash =
      typeof row.cash === "number" && Number.isFinite(row.cash) ? row.cash : STARTING_EQUITY;
    const pos = row.position;
    if (!pos || typeof pos !== "object") return { cash, position: null };
    const item = pos as Record<string, unknown>;
    if (
      !isSide(item.side) ||
      typeof item.entry !== "number" ||
      !(item.entry > 0) ||
      typeof item.qty !== "number" ||
      !(item.qty > 0) ||
      typeof item.openedAt !== "number"
    ) {
      return { cash, position: null };
    }
    return {
      cash,
      position: {
        side: item.side,
        entry: item.entry,
        qty: item.qty,
        openedAt: item.openedAt,
      },
    };
  } catch {
    return FRESH;
  }
}

export function saveBook(book: PaperBook) {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    /* private mode / quota */
  }
}

export function openPosition(book: PaperBook, side: Side, price: number, openedAt: number): PaperBook {
  if (book.position || !(price > 0) || !(book.cash > 0)) return book;
  return {
    cash: book.cash,
    position: {
      side,
      entry: price,
      qty: book.cash / price,
      openedAt,
    },
  };
}

export function closePosition(book: PaperBook, price: number): PaperBook {
  if (!book.position || !(price > 0)) return book;
  return {
    cash: Math.max(0, book.cash + unrealized(book.position, price)),
    position: null,
  };
}
