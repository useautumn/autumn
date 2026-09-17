import type { Decision } from "../../../models/common/decision.js";
import type { WorkerCustomerEntitlement } from "../../../models/rows/workerCustomerEntitlement.js";

export type SupportedCheckDecision = {
	kind: "decided";
	allowed: boolean;
	reason: "insufficient_balance" | null;
	balance: number;
	customerEntitlement: WorkerCustomerEntitlement;
	requiredBalance: number;
	revision: number;
};

export type CheckDecision = Decision<SupportedCheckDecision>;
