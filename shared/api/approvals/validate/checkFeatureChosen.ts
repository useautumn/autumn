import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import { isPlainObject } from "../schemas/isPlainObject";
import type { ApprovalRuleIssue } from "./types";

/** A matcher that names features: an id, `{ $eq: id }`, or a non-empty `$in`. */
const namesFeatures = ({ matcher }: { matcher: unknown }) => {
	if (typeof matcher === "string") return matcher.length > 0;
	if (!isPlainObject(matcher)) return false;
	const keys = Object.keys(matcher);
	if (keys.length !== 1) return false;
	if (typeof matcher.$eq === "string") return matcher.$eq.length > 0;
	return Array.isArray(matcher.$in) && matcher.$in.length > 0;
};

/**
 * Balances amounts are in a feature's unit, so a rule must name the feature(s)
 * at the top of `filter`. Excluding one or matching any would mix units.
 */
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
	const choosesFeature =
		isPlainObject(filter) && namesFeatures({ matcher: filter.feature_id });
	if (!isBalancesRule || choosesFeature) return [];

	const ruleLabel =
		actions.length === 1 ? ACTIONS[actions[0]].label : "Balances";
	return [
		{
			path: "filter.feature_id",
			message: `${ruleLabel} rules must choose a feature.`,
		},
	];
};
