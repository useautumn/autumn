export const formatMs = (ms: number) => `${Math.round(ms)}ms`;

export const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });

const signOf = (delta: number) => {
  if (delta > 0) return "+";
  if (delta < 0) return "−";
  return "±";
};

export const formatDelta = (delta: number) => `${signOf(delta)}${formatNumber(Math.abs(delta))}`;

export const deltaOf = ({ before, after }: { before: number | null; after: number | null }) =>
  before === null || after === null ? null : after - before;

export const numberOrUndefined = (value: string) => {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
