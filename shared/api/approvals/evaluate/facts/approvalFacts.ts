import type { ACTIONS, ApprovalAction } from "../../actions/approvalActions";
import type { WhenKey } from "../../schemas/when/whenSchemas";
import type { BalanceCreateFacts, BalanceUpdateFacts } from "./balanceFacts";
import type { BillingCancelFacts, BillingChangeFacts } from "./billingFacts";
import type { InvoiceFacts } from "./invoiceFacts";
import type {
	CatalogFeatureFacts,
	CatalogPlanFacts,
	CustomerFacts,
	RewardApplyFacts,
} from "./otherFacts";

/** The facts each `when` shape is checked against; field names mirror the shape. */
export type ApprovalFactsByWhen = {
	billing_change: BillingChangeFacts;
	billing_cancel: BillingCancelFacts;
	invoice: InvoiceFacts;
	balance_create: BalanceCreateFacts;
	balance_update: BalanceUpdateFacts;
	reward_apply: RewardApplyFacts;
	customer: CustomerFacts;
	catalog_plan: CatalogPlanFacts;
	catalog_feature: CatalogFeatureFacts;
};

export type ApprovalFacts = ApprovalFactsByWhen[WhenKey];

type ActionWhen<Action extends ApprovalAction> =
	(typeof ACTIONS)[Action]["when"];

/** Facts an action is checked against; `null` for who-only actions. */
export type ApprovalFactsFor<Action extends ApprovalAction> = [
	ActionWhen<Action>,
] extends [WhenKey]
	? ApprovalFactsByWhen[ActionWhen<Action>]
	: [ActionWhen<Action>] extends [null]
		? null
		: // ACTIONS widens `when` for billing and invoice actions today, so those accept any area's facts.
			ApprovalFacts;
