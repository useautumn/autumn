import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRuleIssue } from "./types";

/** Balances amounts are in a feature's unit, so the feature is pinned at the top of `filter`. */
export const checkFeatureChosen = ({
	actions,
	filter,
}: {
	actions: ApprovalAction[];
	filter: unknown;
}): ApprovalRuleIssue[] => {
	const isBalancesRule = actions.every(
		(action) => ACTIONS[action].area === "balances",
	);
	const hasFeature =
		typeof filter === "object" && filter !== null && "feature_id" in filter;
	if (!isBalancesRule || hasFeature) return [];

	const ruleLabel =
		actions.length === 1 ? ACTIONS[actions[0]].label : "Balances";
	return [
		{
			path: "filter.feature_id",
			message: `${ruleLabel} rules must choose a feature.`,
		},
	];
};
