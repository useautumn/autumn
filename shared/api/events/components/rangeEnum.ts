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
