import { ApiBalanceSchema } from "@api/customers/cusFeatures/apiBalance.js";
import { ApiSubscriptionSchema } from "@api/customers/cusPlans/apiSubscription.js";
import { ApiInvoiceSchema } from "@api/others/apiInvoice.js";
import { z } from "zod/v4";
import { ApiBaseEntitySchema } from "./apiBaseEntity.js";

// Re-export for backward compatibility
export { ApiBaseEntitySchema } from "./apiBaseEntity.js";

export const ApiEntityV1Schema = ApiBaseEntitySchema.extend({
	subscriptions: z.array(ApiSubscriptionSchema).optional().meta({
		description: "Plans associated with this entity",
		example: [],
	}),
	balances: z.record(z.string(), ApiBalanceSchema).optional().meta({
		description: "Features associated with this entity",
	}),
	invoices: z.array(ApiInvoiceSchema).optional().meta({
		description:
			"Invoices for this entity (only included when expand=invoices)",
	}),
});

// Alias for backward compatibility
export const ApiEntitySchema = ApiEntityV1Schema;

export type ApiEntityV1 = z.infer<typeof ApiEntityV1Schema>;
