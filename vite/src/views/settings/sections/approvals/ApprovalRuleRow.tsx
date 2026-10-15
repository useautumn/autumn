import { Switch, TableCell, TableRow } from "@autumn/ui";
import { format } from "date-fns";
import { useToggleApprovalRule } from "@/hooks/queries/useApprovalRulesMutations";
import { cn } from "@/lib/utils";
import type { ApprovalRule } from "./approvalRuleTypes";
import type { SentencePart } from "./buildRuleSentence";
import { RuleSentence } from "./RuleSentence";

export const ApprovalRuleRow = ({
	rule,
	parts,
}: {
	rule: ApprovalRule;
	parts: SentencePart[];
}) => {
	const toggle = useToggleApprovalRule();
	const enabled = toggle.isPending ? toggle.variables.enabled : rule.enabled;

	return (
		<TableRow className="hover:bg-transparent">
			<TableCell className="whitespace-normal py-4 pl-4">
				<div className={cn("flex flex-col gap-3", !enabled && "opacity-50")}>
					<RuleSentence parts={parts} />
					<span className="text-subtle text-xs">
						Edited by {rule.updated_by.name} ·{" "}
						{format(rule.updated_at, "MMM d")}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<Switch
					aria-label={`${enabled ? "Disable" : "Enable"} ${rule.name}`}
					checked={enabled}
					onCheckedChange={(checked) =>
						toggle.mutate({ id: rule.id, enabled: checked })
					}
				/>
			</TableCell>
			<TableCell />
		</TableRow>
	);
};
