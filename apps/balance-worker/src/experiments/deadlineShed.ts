import { variant } from "@autumn/edge-config";

/** B drops requests their caller has already abandoned and sheds a hot customer's checks while the task is behind. */
export const DEADLINE_SHED_EXPERIMENT = "deadline-shed";

export function shedsDeadlines(): boolean {
	return variant(DEADLINE_SHED_EXPERIMENT) === "B";
}
