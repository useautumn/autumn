import type { ApprovalRule } from "@autumn/shared";
import { buildRuleSentence } from "./buildRuleSentence";
import { useApprovalRuleLabels } from "./useApprovalRuleLabels";

/** Each rule with its sentence, narrowed to rules whose subjects match `filter`. */
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
		.map((rule) => ({ rule, parts: buildRuleSentence({ rule, labels }) }))
		.filter(({ parts }) =>
			parts.some(
				(part) =>
					part.kind === "subject" && part.text.toLowerCase().includes(needle),
			),
		);
};
