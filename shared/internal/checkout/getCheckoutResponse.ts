import { z } from "zod/v4";
import { CheckoutResponseBaseSchema } from "./checkoutResponseCommon";

export const GetCheckoutResponseSchema = z.object({
	...CheckoutResponseBaseSchema.shape,
});

export type GetCheckoutResponse = z.infer<typeof GetCheckoutResponseSchema>;
