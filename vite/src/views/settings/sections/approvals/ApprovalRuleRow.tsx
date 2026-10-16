import type { ApprovalRule } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
	Switch,
	TableCell,
	TableRow,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useToggleApprovalRule } from "@/hooks/queries/useApprovalRulesMutations";
import { cn } from "@/lib/utils";
import type { SentencePart } from "./buildRuleSentence";
import { RuleSentencePart } from "./RuleSentencePart";

export type RuleRowActions = {
	onEdit: (rule: ApprovalRule) => void;
	onDelete: (rule: ApprovalRule) => void;
};

export const ApprovalRuleRow = ({
	rule,
	parts,
	onEdit,
	onDelete,
}: {
	rule: ApprovalRule;
	parts: SentencePart[];
	onEdit: () => void;
	onDelete: () => void;
}) => {
	const toggle = useToggleApprovalRule();
	const enabled = toggle.isPending ? toggle.variables.enabled : rule.enabled;

	return (
		<TableRow className="hover:bg-transparent">
			<TableCell className="whitespace-normal py-4 pl-4">
				<div className={cn("flex flex-col gap-3", !enabled && "opacity-50")}>
					<p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
						{parts.map((part) => (
							<RuleSentencePart key={part.key} part={part} />
						))}
					</p>
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
					disabled={toggle.isPending}
					onCheckedChange={(checked) =>
						toggle.mutate({ id: rule.id, enabled: checked })
					}
				/>
			</TableCell>
			<TableCell className="pr-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<IconButton
								variant="skeleton"
								size="icon"
								iconOrientation="center"
								icon={<DotsThreeIcon />}
								aria-label={`${rule.name} actions`}
							/>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onEdit}>Edit rule</DropdownMenuItem>
						<DropdownMenuItem variant="destructive" onClick={onDelete}>
							Delete rule
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</TableRow>
	);
};
