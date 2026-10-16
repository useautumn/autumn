import {
	type BalanceCreateWhen,
	type BalanceUpdateWhen,
	balanceCreateWhenShape,
	balanceUpdateWhenShape,
} from "./balanceWhen";
import {
	type BillingCancelWhen,
	type BillingChangeWhen,
	billingCancelWhenShape,
	billingChangeWhenShape,
} from "./billingWhen";
import {
	type CatalogFeatureWhen,
	type CatalogPlanWhen,
	catalogFeatureWhenShape,
	catalogPlanWhenShape,
} from "./catalogWhen";
import { type CustomerWhen, customerWhenShape } from "./customerWhen";
import { type InvoiceWhen, invoiceWhenShape } from "./invoiceWhen";
import { type RewardApplyWhen, rewardApplyWhenShape } from "./rewardWhen";

/** Each `when` shape, keyed by the name actions refer to it by. */
export const WHEN_SHAPES = {
	billing_change: billingChangeWhenShape,
	billing_cancel: billingCancelWhenShape,
	invoice: invoiceWhenShape,
	balance_create: balanceCreateWhenShape,
	balance_update: balanceUpdateWhenShape,
	reward_apply: rewardApplyWhenShape,
	customer: customerWhenShape,
	catalog_plan: catalogPlanWhenShape,
	catalog_feature: catalogFeatureWhenShape,
};

export type WhenKey = keyof typeof WHEN_SHAPES;

/** A rule's conditions, in the shape of its actions' area. */
export type ApprovalRuleWhen =
	| BillingChangeWhen
	| BillingCancelWhen
	| InvoiceWhen
	| BalanceCreateWhen
	| BalanceUpdateWhen
	| RewardApplyWhen
	| CustomerWhen
	| CatalogPlanWhen
	| CatalogFeatureWhen;
