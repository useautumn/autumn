import { z } from "zod/v4";

export const BinSizeEnum = z.enum(["day", "hour"]).default("day");

export type BinSizeEnum = z.infer<typeof BinSizeEnum>;
