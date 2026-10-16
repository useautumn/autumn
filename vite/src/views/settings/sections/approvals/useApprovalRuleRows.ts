import type { ApprovalRule } from "./approvalsStub";
import { buildRuleSentence } from "./buildRuleSentence";
import { useApprovalRuleLabels } from "./useApprovalRuleLabels";

/** Each rule with its sentence and 1-based order, narrowed to rules whose subjects match `filter`. */
export const useApprovalRuleRows = ({
	rules,
	filter,
}: {
	rules: ApprovalRule[];
	filter: string;
}) => {
	const labels = useApprovalRuleLabels();
	const needle = filter.trim().toLowerCase();

	return rules
		.map((rule, i) => ({
			rule,
			order: i + 1,
			parts: buildRuleSentence({ rule, labels }),
		}))
		.filter(({ parts }) =>
			parts.some(
				(part) =>
					part.kind === "subject" && part.text.toLowerCase().includes(needle),
			),
		);
};
