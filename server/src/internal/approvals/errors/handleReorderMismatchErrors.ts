import type { ReorderApprovalRulesResult } from "../repos/reorderApprovalRules.js";
import { handleApprovalRuleNotFoundErrors } from "./handleApprovalRuleNotFoundErrors.js";
import { handleInvalidApprovalRuleErrors } from "./handleInvalidApprovalRuleErrors.js";

/** An id that isn't a rule is a 404; a list that leaves rules out or repeats one is a 400 on `ids`. */
export const handleReorderMismatchErrors = ({
	result,
}: {
	result: ReorderApprovalRulesResult;
}) => {
	if (result.ok) return result.rules;

	const [unknownId] = result.unknown;
	if (unknownId)
		handleApprovalRuleNotFoundErrors({ ruleId: unknownId, rule: undefined });

	handleInvalidApprovalRuleErrors({
		issues: [
			...(result.missing.length > 0
				? [
						{
							path: "ids",
							message: `Send every rule id. Missing: ${result.missing.join(", ")}.`,
						},
					]
				: []),
			...(result.duplicates.length > 0
				? [
						{
							path: "ids",
							message: `Each rule id can appear once. Repeated: ${result.duplicates.join(", ")}.`,
						},
					]
				: []),
		],
	});
	return [];
};
