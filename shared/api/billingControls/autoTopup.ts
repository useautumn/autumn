import type { z } from "zod/v4";
import { AutoTopupResponseSchema } from "../../models/cusModels/billingControls/customerBillingControls.js";
import { BillingControlSourceSchema } from "./billingControlSource.js";

export const ApiAutoTopupSchema = AutoTopupResponseSchema.extend({
	source: BillingControlSourceSchema.optional(),
});

export type ApiAutoTopup = z.infer<typeof ApiAutoTopupSchema>;
