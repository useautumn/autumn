import type { ACTIONS, ApprovalAction } from "../../actions/approvalActions";
import type { ApprovalFilterKey } from "../../schemas/filters/approvalFilterShapes";
import type { BalanceCreateFacts, BalanceUpdateFacts } from "./balanceFacts";
import type {
	BillingCancelFacts,
	BillingChangeFacts,
	BillingUncancelFacts,
} from "./billingFacts";
import type { InvoiceFacts } from "./invoiceFacts";
import type {
	CustomerChangeFacts,
	FeatureFacts,
	PlanFacts,
	RewardRedeemFacts,
} from "./otherFacts";

/** The facts each filter shape is matched against; field names mirror the shape. */
export type ApprovalFactsByFilterKey = {
	billing_change: BillingChangeFacts;
	billing_cancel: BillingCancelFacts;
	billing_uncancel: BillingUncancelFacts;
	invoice: InvoiceFacts;
	balance_create: BalanceCreateFacts;
	balance_update: BalanceUpdateFacts;
	reward_redeem: RewardRedeemFacts;
	customer_change: CustomerChangeFacts;
	plan: PlanFacts;
	feature: FeatureFacts;
};

export type ApprovalFacts = ApprovalFactsByFilterKey[ApprovalFilterKey];

type ActionFilterKey<Action extends ApprovalAction> =
	(typeof ACTIONS)[Action]["filter"];

/** Facts an action is matched against; `null` for who-only actions. */
export type ApprovalFactsFor<Action extends ApprovalAction> =
	ActionFilterKey<Action> extends infer Key
		? Key extends ApprovalFilterKey
			? ApprovalFactsByFilterKey[Key]
			: null
		: never;
