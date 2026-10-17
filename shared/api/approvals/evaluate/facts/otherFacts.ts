import type { ApprovalCustomerFacts } from "./customerFacts";

export type RewardRedeemFacts = {
	customer: ApprovalCustomerFacts;
	reward_id: string;
};

/** Update or delete a customer. */
export type CustomerChangeFacts = { customer: ApprovalCustomerFacts };

/** The plan being created, updated or deleted. */
export type PlanFacts = { plan_id: string };

/** The feature being created, updated or deleted. */
export type FeatureFacts = { feature_id: string };
