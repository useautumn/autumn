import { z } from "zod/v4";
import {
	createListPageResponseSchema,
	entityRequiresCustomerMessage,
	ListPageRequestSchema,
	requireCustomerForEntity,
} from "../../../common/listPageSchemas.js";
import {
	ApiPurchaseV0Schema,
	ApiSubscriptionV1Schema,
} from "../apiSubscriptionV1.js";

export const SubscriptionListStatusSchema = z.enum([
	"active",
	"scheduled",
	"past_due",
	"expired",
]);
export type SubscriptionListStatus = z.infer<
	typeof SubscriptionListStatusSchema
>;

export const ListSubscriptionsParamsSchema = ListPageRequestSchema.extend({
	statuses: z.array(SubscriptionListStatusSchema).min(1).optional().meta({
		description:
			"Statuses to include. Defaults to active and scheduled. past_due matches plans with overdue payments, which read as status active with past_due true.",
	}),
	plan_id: z.string().optional().meta({
		description: "Only return rows for this plan.",
	}),
}).refine(requireCustomerForEntity, entityRequiresCustomerMessage);

export type ListSubscriptionsParams = z.infer<
	typeof ListSubscriptionsParamsSchema
>;
export type ListSubscriptionsParamsInput = z.input<
	typeof ListSubscriptionsParamsSchema
>;
export type ListPurchasesParamsInput = ListSubscriptionsParamsInput;

const ListRowOwnerSchema = z.object({
	customer_id: z.string().meta({
		description: "The customer this row belongs to.",
	}),
	entity_id: z.string().nullable().meta({
		description: "The entity this row is scoped to, or null.",
	}),
	created_at: z.number().meta({
		description: "Timestamp when this row was created.",
	}),
});

export const SubscriptionListRowSchema = ApiSubscriptionV1Schema.omit({
	plan: true,
	status: true,
})
	.extend({
		status: z.enum(["active", "scheduled", "expired"]).meta({
			description: "Current status of the subscription.",
		}),
	})
	.extend(ListRowOwnerSchema.shape);

export const PurchaseListRowSchema = ApiPurchaseV0Schema.omit({ plan: true })
	.extend({
		id: z.string().meta({
			description:
				"The unique identifier of this purchase. Falls back to the internal ID when none was provided.",
		}),
		status: z.enum(["active", "scheduled", "expired"]).meta({
			description: "Current status of the purchase.",
		}),
	})
	.extend(ListRowOwnerSchema.shape);

export const ListSubscriptionsResponseSchema = createListPageResponseSchema(
	SubscriptionListRowSchema,
);
export const ListPurchasesResponseSchema = createListPageResponseSchema(
	PurchaseListRowSchema,
);

export type SubscriptionListRow = z.infer<typeof SubscriptionListRowSchema>;
export type PurchaseListRow = z.infer<typeof PurchaseListRowSchema>;
export type ListSubscriptionsResponse = z.infer<
	typeof ListSubscriptionsResponseSchema
>;
export type ListPurchasesResponse = z.infer<typeof ListPurchasesResponseSchema>;
