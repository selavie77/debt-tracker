export function toCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100);
}

export function usd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const n = Math.abs(cents) / 100;
  return sign + "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function usdWhole(cents: number): string {
  return (cents < 0 ? "-" : "") + "$" + Math.round(Math.abs(cents) / 100).toLocaleString("en-US");
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function rateLabel(bps: number | null): string {
  return bps == null ? "n/a" : (bps / 100).toFixed(2).replace(/\.?0+$/, "") + "%";
}
