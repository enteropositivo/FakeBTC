const price = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const macdPrice = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number): string {
  return price.format(value);
}

export function formatMacd(value: number): string {
  return macdPrice.format(value);
}

export function formatUsd(value: number): string {
  return `${price.format(value)} $`;
}

export function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatUsd(value)}`;
}

export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  const body = value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${body}%`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBarTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
