import { z } from "zod/v4";
import { CheckoutResponseBaseSchema } from "./checkoutResponseCommon";

export const PreviewCheckoutResponseSchema = z.object({
	...CheckoutResponseBaseSchema.shape,
});

export type PreviewCheckoutResponse = z.infer<
	typeof PreviewCheckoutResponseSchema
>;
