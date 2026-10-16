import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRuleIssue } from "./types";

/** Balances amounts are in a feature's unit, so the feature is pinned at the top of `when`. */
export const checkFeatureChosen = ({
	actions,
	when,
}: {
	actions: ApprovalAction[];
	when: unknown;
}): ApprovalRuleIssue[] => {
	const isBalancesRule = actions.every(
		(action) => ACTIONS[action].area === "balances",
	);
	const hasFeature =
		typeof when === "object" && when !== null && "feature_id" in when;
	if (!isBalancesRule || hasFeature) return [];

	const ruleLabel =
		actions.length === 1 ? ACTIONS[actions[0]].label : "Balances";
	return [
		{
			path: "when.feature_id",
			message: `${ruleLabel} rules must choose a feature.`,
		},
	];
};
