import { z } from "zod/v4";

export const CheckoutModeSchema = z
	.enum(["stripe_checkout", "autumn_checkout"])
	.nullable();

export type CheckoutMode = z.infer<typeof CheckoutModeSchema>;
