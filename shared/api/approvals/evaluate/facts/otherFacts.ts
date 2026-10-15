import type { FullCustomer } from "@models/cusModels/fullCusModel";

export type RewardApplyFacts = { customer: FullCustomer; reward_id: string };

/** Update or delete a customer. */
export type CustomerFacts = { customer: FullCustomer };

/** The plan being edited. */
export type CatalogPlanFacts = { plan_id: string };

/** The feature being edited. */
export type CatalogFeatureFacts = { feature_id: string };
