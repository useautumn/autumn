import type { ApprovalRuleIssue, WhenEntry } from "./types";

const PLAN_ARRAY_KEYS = ["incoming", "outgoing", "plan"];

const nearestPlanArray = ({ path }: { path: WhenEntry["path"] }) =>
	[...path]
		.reverse()
		.find((segment) => PLAN_ARRAY_KEYS.includes(String(segment)));

const isCustomOnIncomingPlan = ({ key, path }: WhenEntry) =>
	key === "custom" && nearestPlanArray({ path }) === "incoming";

/**
 * `custom` marks an existing customer plan, so it can't describe a plan being
 * added; the request-level flag for that is `customized`.
 */
export const findCustomOnIncomingPlans = ({
	entries,
}: {
	entries: WhenEntry[];
}): ApprovalRuleIssue[] =>
	entries.filter(isCustomOnIncomingPlan).map((entry) => ({
		path: entry.path.join("."),
		message: 'Incoming plans use "Custom pricing" (customized), not "custom".',
	}));
