import type { RuleSubject } from "@autumn/shared";
import { GlobeIcon, UserIcon, UsersIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { SentencePart } from "./buildRuleSentence";

export const SUBJECT_ICONS: Record<RuleSubject["type"], typeof UserIcon> = {
	everyone: GlobeIcon,
	role: UsersIcon,
	user: UserIcon,
};

const CHIP_CLASS =
	"inline-flex items-center gap-1 rounded-md border bg-interactive-secondary px-1.5 py-0.5 text-foreground";

/** One token of a rule sentence: a joining word, or a chip for a subject, action or condition. */
export const RuleSentencePart = ({ part }: { part: SentencePart }) => {
	if (part.kind === "word") {
		return <span className="text-tertiary-foreground">{part.text}</span>;
	}
	if (part.kind === "action")
		return <span className={CHIP_CLASS}>{part.text}</span>;
	if (part.kind === "subject") {
		const Icon = SUBJECT_ICONS[part.subject.type];
		return (
			<span className={CHIP_CLASS}>
				<Icon className="size-3.5 text-tertiary-foreground" />
				{part.text}
			</span>
		);
	}
	return (
		<span className={cn(CHIP_CLASS, "text-tertiary-foreground")}>
			{part.field}
			{part.operator && <span className="text-subtle">{part.operator}</span>}
			<span className="text-foreground">{part.value}</span>
		</span>
	);
};
