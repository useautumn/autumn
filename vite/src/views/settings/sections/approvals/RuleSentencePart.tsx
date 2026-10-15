import { GlobeIcon, UserIcon, UsersIcon } from "@phosphor-icons/react";
import type { RuleSubject } from "./approvalRuleTypes";
import type { SentencePart } from "./buildRuleSentence";
import { SentenceChip } from "./SentenceChip";

const SUBJECT_ICONS: Record<RuleSubject["type"], typeof UserIcon> = {
	everyone: GlobeIcon,
	role: UsersIcon,
	user: UserIcon,
};

export const RuleSentencePart = ({ part }: { part: SentencePart }) => {
	if (part.kind === "word") {
		return <span className="text-tertiary-foreground">{part.text}</span>;
	}
	if (part.kind === "action") return <SentenceChip>{part.text}</SentenceChip>;
	if (part.kind === "subject") {
		const Icon = SUBJECT_ICONS[part.subject.type];
		return (
			<SentenceChip>
				<Icon className="size-3.5 text-tertiary-foreground" />
				{part.text}
			</SentenceChip>
		);
	}
	return (
		<SentenceChip className="text-tertiary-foreground">
			{part.field}
			{part.operator && <span className="text-subtle">{part.operator}</span>}
			<span className="text-foreground">{part.value}</span>
		</SentenceChip>
	);
};
