import { z } from "zod/v4";
import {
	type BalanceCreateFilter,
	type BalanceUpdateFilter,
	balanceCreateFilterShape,
	balanceUpdateFilterShape,
} from "./balanceFilters";
import {
	type BillingCancelFilter,
	type BillingChangeFilter,
	type BillingUncancelFilter,
	billingCancelFilterShape,
	billingChangeFilterShape,
	billingUncancelFilterShape,
} from "./billingFilters";
import { buildFilterSchema } from "./buildFilterSchema";
import { type InvoiceFilter, invoiceFilterShape } from "./invoiceFilter";
import {
	type CustomerChangeFilter,
	customerChangeFilterShape,
	type FeatureChangeFilter,
	featureChangeFilterShape,
	type PlanCatalogFilter,
	planCatalogFilterShape,
	type RewardRedeemFilter,
	rewardRedeemFilterShape,
} from "./otherFilters";

/** Each filter shape, keyed by the name actions refer to it by. */
export const APPROVAL_FILTER_SHAPES = {
	billing_change: billingChangeFilterShape,
	billing_cancel: billingCancelFilterShape,
	billing_uncancel: billingUncancelFilterShape,
	invoice: invoiceFilterShape,
	balance_create: balanceCreateFilterShape,
	balance_update: balanceUpdateFilterShape,
	reward_redeem: rewardRedeemFilterShape,
	customer_change: customerChangeFilterShape,
	plan: planCatalogFilterShape,
	feature: featureChangeFilterShape,
} satisfies Record<string, z.ZodRawShape>;

export type ApprovalFilterKey = keyof typeof APPROVAL_FILTER_SHAPES;

/** A rule's conditions, in the shape of its actions' area. */
export type ApprovalRuleFilter =
	| BillingChangeFilter
	| BillingCancelFilter
	| BillingUncancelFilter
	| InvoiceFilter
	| BalanceCreateFilter
	| BalanceUpdateFilter
	| RewardRedeemFilter
	| CustomerChangeFilter
	| PlanCatalogFilter
	| FeatureChangeFilter;

type FilterSchema = z.ZodType<ApprovalRuleFilter>;

// Loose so reading a stored rule never drops keys; the validator checks the exact area.
const looseFilterSchemas = Object.values(APPROVAL_FILTER_SHAPES).map(
	(shape) => buildFilterSchema({ shape, loose: true }) as FilterSchema,
);

/** Any area's filter, for typing and the API docs. `null` = always. */
export const ApprovalRuleFilterSchema = z
	.union(looseFilterSchemas as [FilterSchema, ...FilterSchema[]])
	.meta({
		description:
			"Conditions in the shape of the rule's area (e.g. billing change). null means always.",
	});
