import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "../customers/cusFeatures/apiBalanceV1.js";
import { ApiSubscriptionV1Schema } from "../customers/cusPlans/apiSubscriptionV1.js";
import { ApiInvoiceV1Schema } from "../others/apiInvoice/apiInvoiceV1.js";
import { ApiBaseEntitySchema } from "./apiBaseEntity.js";

export const ApiEntityV2Schema = ApiBaseEntitySchema.extend({
	subscriptions: z.array(ApiSubscriptionV1Schema).optional().meta({
		description: "Plans associated with this entity",
		example: [],
	}),
	balances: z.record(z.string(), ApiBalanceV1Schema).optional().meta({
		description: "Features associated with this entity",
	}),
	invoices: z.array(ApiInvoiceV1Schema).optional().meta({
		description:
			"Invoices for this entity (only included when expand=invoices)",
	}),
});

export type ApiEntityV2 = z.infer<typeof ApiEntityV2Schema>;
