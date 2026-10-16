import type { Membership } from "@autumn/shared";
import { InfoIcon } from "@phosphor-icons/react";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { useRolesQuery } from "@/hooks/queries/useRolesQuery";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { roleLabel } from "../../roles/roleAccess";
import { actionText } from "../buildRuleSentence";
import {
	type PrecedenceDraft,
	precedenceWarnings,
	precedenceWarningText,
} from "../precedenceWarnings";
import { useApprovalRuleLabels } from "../useApprovalRuleLabels";

/** Warns when naming a member here stops their role's or Everyone's rules applying to them. */
export const PrecedenceWarning = ({ draft }: { draft: PrecedenceDraft }) => {
	const { rules } = useApprovalRulesQuery();
	const { roles } = useRolesQuery();
	const { memberships } = useMemberships();
	const labels = useApprovalRuleLabels();

	const roleOf = (userId: string) =>
		memberships.find(({ user }: Membership) => user.id === userId)?.member
			.role ?? null;
	const warnings = precedenceWarnings({ draft, rules, roleOf });
	if (warnings.length === 0) return null;

	return (
		<ul className="flex flex-col gap-1.5">
			{warnings.map(({ userId, overridden, actions }) => (
				<li
					key={`${userId}-${overridden.type}`}
					className="flex gap-1.5 text-subtle text-xs"
				>
					<InfoIcon className="mt-px size-3.5 shrink-0" />
					{precedenceWarningText({
						userName: labels.member(userId),
						overriddenName:
							overridden.type === "role"
								? roleLabel({ roles, name: overridden.role })
								: "Everyone",
						actionLabels: actions.map(actionText),
					})}
				</li>
			))}
		</ul>
	);
};
