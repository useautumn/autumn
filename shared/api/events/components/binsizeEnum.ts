import { z } from "zod/v4";

export const BinSizeEnum = z
	.enum(["day", "hour", "week", "month"])
	.default("day");

export type BinSizeEnum = z.infer<typeof BinSizeEnum>;
