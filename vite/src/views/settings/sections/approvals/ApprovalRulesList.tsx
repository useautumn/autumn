import { Skeleton } from "@autumn/ui";
import { InfoIcon } from "@phosphor-icons/react";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { ApprovalRulesEmpty } from "./ApprovalRulesEmpty";
import { ApprovalRulesTable } from "./ApprovalRulesTable";
import type { RuleDialogs } from "./editor/useRuleDialogs";

const NOTES = [
	"Rules are checked most specific first. If no rule covers an action, the role's access applies.",
	"Owners, Admins and full-access keys are never limited. Sandbox stays unrestricted.",
];

export const ApprovalRulesList = ({ dialogs }: { dialogs: RuleDialogs }) => {
	const { rules, isLoading } = useApprovalRulesQuery();

	if (isLoading) return <Skeleton className="h-64 w-full" />;

	return (
		<div className="flex flex-col gap-6">
			{rules.length > 0 ? (
				<ApprovalRulesTable rules={rules} dialogs={dialogs} />
			) : (
				<ApprovalRulesEmpty
					title="No rules yet"
					description="Without rules, each role keeps its usual access."
				/>
			)}
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
};
