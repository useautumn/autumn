import { InfoIcon } from "@phosphor-icons/react";
import { ApprovalRulesBody } from "./ApprovalRulesBody";
import type { ApprovalRule } from "./approvalsStub";
import type { RuleRowActions } from "./RuleRowMenu";

const NOTES = [
	"The most specific matching rule decides: a member beats their role, a role beats Everyone. At the same level, the rule lower in the list wins.",
	"Rules apply to everyone they name, owners and admins included. API keys skip approvals. Sandbox is never restricted.",
	"Rules only narrow what a role can already do.",
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
				<li key={note} className="flex items-start gap-1.5">
					<InfoIcon className="mt-px size-3.5 shrink-0" />
					{note}
				</li>
			))}
		</ul>
	</div>
);
