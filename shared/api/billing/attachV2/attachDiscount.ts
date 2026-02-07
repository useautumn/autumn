import { z } from "zod/v4";

export const AttachDiscountSchema = z.union([
	z.object({ reward_id: z.string() }),
	z.object({ promotion_code: z.string() }),
]);

export type AttachDiscount = z.infer<typeof AttachDiscountSchema>;
