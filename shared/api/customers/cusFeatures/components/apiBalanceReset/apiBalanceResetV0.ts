import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import z from "zod/v4";

export const ApiBalanceResetV0Schema = z.object({
	interval: z.enum(ResetInterval).or(z.literal("multiple")),
	interval_count: z.number().optional(),
	resets_at: z.number().nullable(),
});
export type ApiBalanceResetV0 = z.infer<typeof ApiBalanceResetV0Schema>;
