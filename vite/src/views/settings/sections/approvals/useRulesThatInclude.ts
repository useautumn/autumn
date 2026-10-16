import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { buildRuleSentence } from "./buildRuleSentence";
import {
	includedViaText,
	type RuleAudience,
	rulesThatInclude,
} from "./rulesThatInclude";
import { useApprovalRuleLabels } from "./useApprovalRuleLabels";

/** The rules that include a role or member, each with its sentence and how it includes them. */
export const useRulesThatInclude = ({
	audience,
	name,
	roleName,
}: {
	audience: RuleAudience;
	name: string;
	roleName: string | null;
}) => {
	const { rules, isLoading, error } = useApprovalRulesQuery();
	const labels = useApprovalRuleLabels();

	const items = rulesThatInclude({ rules, audience }).map(({ rule, via }) => ({
		rule,
		parts: buildRuleSentence({ rule, labels }),
		caption: includedViaText({ name, roleName, via }),
	}));

	return { items, isLoading, error };
};
