import type { ApprovalRule } from "@autumn/shared";
import { Switch, TableCell, TableRow } from "@autumn/ui";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { SentencePart } from "./buildRuleSentence";
import { RuleSentencePart } from "./RuleSentencePart";

export const ApprovalRuleRow = ({
	rule,
	parts,
	order,
	enabled,
	canToggle,
	onToggle,
}: {
	rule: ApprovalRule;
	parts: SentencePart[];
	/** 1-based place in the full list; later rules win within a level. */
	order: number;
	enabled: boolean;
	canToggle: boolean;
	onToggle: (enabled: boolean) => void;
}) => (
	<TableRow className="hover:bg-transparent">
		<TableCell className="pl-4 align-top py-4 text-subtle tabular-nums">
			{order}
		</TableCell>
		<TableCell className="whitespace-normal py-4">
			<div className={cn("flex flex-col gap-3", !enabled && "opacity-50")}>
				<p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
					{parts.map((part) => (
						<RuleSentencePart key={part.key} part={part} />
					))}
				</p>
				<span className="text-subtle text-xs">
					Edited by {rule.updated_by.name} · {format(rule.updated_at, "MMM d")}
				</span>
			</div>
		</TableCell>
		<TableCell>
			<Switch
				aria-label={`${enabled ? "Disable" : "Enable"} ${rule.name}`}
				checked={enabled}
				disabled={!canToggle}
				onCheckedChange={onToggle}
			/>
		</TableCell>
		<TableCell />
	</TableRow>
);
