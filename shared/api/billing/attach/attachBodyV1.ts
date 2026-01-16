import { z } from "zod/v4";
import { CheckoutParamsV1Schema } from "../checkout/checkoutParamsV1";

export const AttachBodyV1Schema = CheckoutParamsV1Schema.extend({
	force_checkout: z.boolean().optional(),
});
export type AttachBodyV1 = z.infer<typeof AttachBodyV1Schema>;
