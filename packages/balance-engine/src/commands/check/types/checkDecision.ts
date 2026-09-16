import type { LeanCustomerEntitlement } from "../../../models/rows/leanCustomerEntitlement.js";

export type CheckDecision =
	| {
			kind: "decided";
			allowed: boolean;
			reason: "insufficient_balance" | null;
			balance: number;
			balanceSnapshot: LeanCustomerEntitlement;
			requiredBalance: number;
			revision: number;
	  }
	| {
			kind: "unsupported";
			reason:
				| "entity_not_supported"
				| "feature_not_found"
				| "multiple_customer_entitlements_not_supported"
				| "properties_not_supported"
				| "subject_mismatch";
	  };
