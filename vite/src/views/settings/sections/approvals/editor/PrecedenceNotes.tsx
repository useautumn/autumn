import type { Membership } from "@autumn/shared";
import { ACTIONS, type RuleSubject } from "@autumn/shared";
import { InfoIcon } from "@phosphor-icons/react";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import {
	type PrecedenceDraft,
	type PrecedenceNote,
	precedenceNotes,
	precedenceNoteText,
} from "../precedenceNotes";
import { useApprovalRuleLabels } from "../useApprovalRuleLabels";

const noteKey = (note: PrecedenceNote) =>
	note.kind === "same_level_order"
		? `${JSON.stringify(note.subject)}-${note.other.id}`
		: `${JSON.stringify(note.subject)}-${JSON.stringify(note.broader)}`;

/** Notes where this rule and an opposite-effect rule both reach the same people. */
export const PrecedenceNotes = ({ draft }: { draft: PrecedenceDraft }) => {
	const { rules } = useApprovalRulesQuery();
	const { memberships } = useMemberships();
	const labels = useApprovalRuleLabels();

	const roleOf = (userId: string) =>
		memberships.find(({ user }: Membership) => user.id === userId)?.member
			.role ?? null;
	const nameOf = (subject: RuleSubject) => {
		if (subject.type === "everyone") return "Everyone";
		if (subject.type === "role") return labels.role(subject.role_id);
		return labels.member(subject.user_id);
	};
	const notes = precedenceNotes({ draft, rules, roleOf });
	if (notes.length === 0) return null;

	return (
		<ul className="flex flex-col gap-1.5">
			{notes.map((note) => (
				<li key={noteKey(note)} className="flex gap-1.5 text-subtle text-xs">
					<InfoIcon className="mt-px size-3.5 shrink-0" />
					{precedenceNoteText({
						note,
						nameOf,
						actionLabel: (action) => ACTIONS[action].label,
					})}
				</li>
			))}
		</ul>
	);
};
