import type { ApprovalRule } from "@autumn/shared";
import { cn } from "@/lib/utils";
import type { SentencePart } from "./buildRuleSentence";
import { RuleSentencePart } from "./RuleSentencePart";

/** One rule in a "rules that include" list: its sentence, then its name and how it includes them. */
export const IncludedRuleItem = ({
	rule,
	parts,
	caption,
}: {
	rule: ApprovalRule;
	parts: SentencePart[];
	caption: string;
}) => (
	<li className={cn("flex flex-col gap-2 p-3", !rule.enabled && "opacity-50")}>
		<p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
			{parts.map((part) => (
				<RuleSentencePart key={part.key} part={part} />
			))}
		</p>
		<span className="text-subtle text-xs">
			{rule.name} · {caption}
			{!rule.enabled && " · Disabled"}
		</span>
	</li>
);
