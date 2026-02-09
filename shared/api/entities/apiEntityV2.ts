import { z } from "zod/v4";
import { ApiBalanceSchema } from "../customers/cusFeatures/apiBalance.js";
import { ApiSubscriptionV1Schema } from "../customers/cusPlans/apiSubscriptionV1.js";
import { ApiInvoiceV1Schema } from "../others/apiInvoice/apiInvoiceV1.js";
import { ApiBaseEntitySchema } from "./apiBaseEntity.js";

// V2 base entity - uses V1 subscriptions (single array with status field)
export const BaseApiEntityV2Schema = ApiBaseEntitySchema.extend({
	subscriptions: z.array(ApiSubscriptionV1Schema),
	balances: z.record(z.string(), ApiBalanceSchema),
});

export const ApiEntityExpandSchema = z.object({
	invoices: z.array(ApiInvoiceV1Schema).optional().meta({
		description:
			"Invoices for this entity (only included when expand=invoices)",
	}),
});

export const ApiEntityV2Schema = BaseApiEntityV2Schema.extend(
	ApiEntityExpandSchema.shape,
);

export type ApiEntityV2 = z.infer<typeof ApiEntityV2Schema>;
export type BaseApiEntityV2 = z.infer<typeof BaseApiEntityV2Schema>;
