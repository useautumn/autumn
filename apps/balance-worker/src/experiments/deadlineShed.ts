import { variant } from "@autumn/edge-config";

/** B sheds a hot customer's checks while the task is behind, so the other customers on it keep their latency. */
export const DEADLINE_SHED_EXPERIMENT = "deadline-shed";

export function shedsHotCustomerChecks(): boolean {
	return variant(DEADLINE_SHED_EXPERIMENT) === "B";
}
