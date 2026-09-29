import { z } from "zod/v4";
import {
	createListPageResponseSchema,
	entityRequiresCustomerMessage,
	ListPageRequestSchema,
	requireCustomerForEntity,
} from "../../common/listPageSchemas.js";
import { ApiBalanceRolloverSchema } from "../../customers/cusFeatures/apiBalance.js";
import { ApiBalanceBreakdownV1Schema } from "../../customers/cusFeatures/apiBalanceV1.js";

export const BalanceListStatusSchema = z.enum(["active", "expired"]);
export type BalanceListStatus = z.infer<typeof BalanceListStatusSchema>;

export const ListBalancesParamsSchema = ListPageRequestSchema.extend({
	statuses: z.array(BalanceListStatusSchema).min(1).optional().meta({
		description:
			"Statuses to include. Defaults to active. A balance is expired when its plan expired, or when a standalone balance passed its expires_at.",
	}),
	plan_id: z.string().nullable().optional().meta({
		description:
			"Only return balances from this plan. Pass null for standalone balances only (top-ups, balances.create, rollovers).",
	}),
	feature_id: z.string().optional().meta({
		description: "Only return balances for this feature.",
	}),
}).refine(requireCustomerForEntity, entityRequiresCustomerMessage);

export type ListBalancesParams = z.infer<typeof ListBalancesParamsSchema>;
export type ListBalancesParamsInput = z.input<typeof ListBalancesParamsSchema>;

export const BalanceListRowSchema = ApiBalanceBreakdownV1Schema.omit({
	object: true,
	overage: true,
}).extend({
	feature_id: z.string().meta({
		description: "The feature this balance is for.",
	}),
	status: BalanceListStatusSchema.meta({
		description: "Whether this balance is active or expired.",
	}),
	rollovers: z.array(ApiBalanceRolloverSchema).meta({
		description: "Rollover balances carried over onto this balance.",
	}),
	customer_id: z.string().meta({
		description: "The customer this balance belongs to.",
	}),
	entity_id: z.string().nullable().meta({
		description: "The entity this balance is scoped to, or null.",
	}),
	created_at: z.number().meta({
		description: "Timestamp when this balance was created.",
	}),
});

export const ListBalancesResponseSchema =
	createListPageResponseSchema(BalanceListRowSchema);

export type BalanceListRow = z.infer<typeof BalanceListRowSchema>;
export type ListBalancesResponse = z.infer<typeof ListBalancesResponseSchema>;
