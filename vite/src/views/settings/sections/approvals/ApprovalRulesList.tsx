import type { ApprovalRule } from "@autumn/shared";
import { InfoIcon } from "@phosphor-icons/react";
import type { RuleRowActions } from "./ApprovalRuleRow";
import { ApprovalRulesBody } from "./ApprovalRulesBody";

const NOTES = [
	"Rules are checked most specific first. If no rule covers an action, the role's access applies.",
	"Owners, Admins and full-access keys are never limited. Sandbox stays unrestricted.",
];

export const ApprovalRulesList = ({
	rules,
	error,
	isSandbox,
	rowActions,
}: {
	rules: ApprovalRule[];
	error: unknown;
	isSandbox: boolean;
	rowActions: RuleRowActions;
}) => (
	<div className="flex flex-col gap-6">
		{isSandbox && (
			<p className="text-sm text-tertiary-foreground">
				These are your live rules. Sandbox is never restricted.
			</p>
		)}
		<ApprovalRulesBody rules={rules} error={error} rowActions={rowActions} />
		<ul className="flex flex-col gap-1.5 text-subtle text-xs">
			{NOTES.map((note) => (
				<li key={note} className="flex items-center gap-1.5">
					<InfoIcon className="size-3.5 shrink-0" />
					{note}
				</li>
			))}
		</ul>
	</div>
);
