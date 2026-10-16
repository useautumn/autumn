import type { ApprovalRuleIssue, FilterEntry } from "./types";

const PLAN_ARRAY_KEYS = ["incoming", "outgoing", "plan"];

const nearestPlanArray = ({ path }: { path: FilterEntry["path"] }) =>
	[...path]
		.reverse()
		.find((segment) => PLAN_ARRAY_KEYS.includes(String(segment)));

const isCustomOnIncomingPlan = ({ key, path }: FilterEntry) =>
	key === "custom" && nearestPlanArray({ path }) === "incoming";

/**
 * `custom` marks an existing customer plan, so it can't describe a plan being
 * added; the request-level flag for that is `customized`.
 */
export const findCustomOnIncomingPlans = ({
	entries,
}: {
	entries: FilterEntry[];
}): ApprovalRuleIssue[] =>
	entries.filter(isCustomOnIncomingPlan).map((entry) => ({
		path: entry.path.join("."),
		message: 'Incoming plans use "Custom pricing" (customized), not "custom".',
	}));
