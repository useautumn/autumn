import { z } from "zod/v4";

export const RangeEnum = z.enum([
	"24h",
	"7d",
	"30d",
	"90d",
	"last_cycle",
	"1bc",
	"3bc",
]);

export type RangeEnum = z.infer<typeof RangeEnum>;

/** Month-scale ranges the internal dashboard accepts on top of `RangeEnum`,
 * mapped to the number of monthly bins each covers. Not on the public API. */
export const MONTH_RANGES = { "6m": 6, "12m": 12 } as const;

export type MonthRangeEnum = keyof typeof MONTH_RANGES;
