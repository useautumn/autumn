import { ApiBalanceV0Schema } from "@api/customers/cusFeatures/previousVersions/apiBalanceV0.js";
import { ApiSubscriptionV0Schema } from "@api/customers/cusPlans/previousVersions/apiSubscriptionV0.js";
import { ApiInvoiceV1Schema } from "@api/others/apiInvoice/apiInvoiceV1.js";
import { z } from "zod/v4";
import { ApiBaseEntitySchema } from "./apiBaseEntity.js";

// Re-export for backward compatibility
export { ApiBaseEntitySchema } from "./apiBaseEntity.js";

export const ApiEntityV1Schema = ApiBaseEntitySchema.extend({
	subscriptions: z.array(ApiSubscriptionV0Schema).optional().meta({
		description: "Plans associated with this entity",
		example: [],
	}),
	scheduled_subscriptions: z.array(ApiSubscriptionV0Schema),
	balances: z.record(z.string(), ApiBalanceV0Schema).optional().meta({
		description: "Features associated with this entity",
	}),
	invoices: z.array(ApiInvoiceV1Schema).optional().meta({
		description:
			"Invoices for this entity (only included when expand=invoices)",
	}),
});

// Alias for backward compatibility
export const ApiEntitySchema = ApiEntityV1Schema;

export type ApiEntityV1 = z.infer<typeof ApiEntityV1Schema>;
