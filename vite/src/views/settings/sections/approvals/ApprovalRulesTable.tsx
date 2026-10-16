import type { ApprovalRule } from "@autumn/shared";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@autumn/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
	useReorderApprovalRules,
	useToggleApprovalRule,
} from "@/hooks/queries/useApprovalRulesMutations";
import { SettingsTable } from "../../SettingsTable";
import { ApprovalRuleRow } from "./ApprovalRuleRow";
import { ApprovalRulesEmpty } from "./ApprovalRulesEmpty";
import { moveRule } from "./moveRule";
import { type RuleRowActions, RuleRowMenu } from "./RuleRowMenu";
import { useApprovalRuleRows } from "./useApprovalRuleRows";

const COLUMNS = [
	{ label: "#", width: "5%" },
	{ label: "Rule", width: "80%" },
	{ label: "Enabled", width: "10%" },
];

export const ApprovalRulesTable = ({
	rules,
	rowActions,
}: {
	rules: ApprovalRule[];
	rowActions: RuleRowActions;
}) => {
	const [filter, setFilter] = useState("");
	const rows = useApprovalRuleRows({ rules, filter });
	const toggle = useToggleApprovalRule();
	const reorder = useReorderApprovalRules();
	const ids = rules.map((rule) => rule.id);
	const enabledCount = rules.filter((rule) => rule.enabled).length;
	const enabledOf = (rule: ApprovalRule) =>
		toggle.isPending && toggle.variables.id === rule.id
			? toggle.variables.enabled
			: rule.enabled;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<InputGroup className="max-w-96">
					<InputGroupAddon>
						<MagnifyingGlassIcon />
					</InputGroupAddon>
					<InputGroupInput
						aria-label="Filter rules"
						placeholder="Filter by person or role"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
					/>
				</InputGroup>
				<span className="shrink-0 text-subtle text-sm">
					{rules.length} {rules.length === 1 ? "rule" : "rules"} ·{" "}
					{enabledCount} enabled
				</span>
			</div>
			{rows.length > 0 ? (
				<SettingsTable columns={COLUMNS}>
					{rows.map(({ rule, parts, order }) => (
						<ApprovalRuleRow
							key={rule.id}
							rule={rule}
							parts={parts}
							order={order}
							enabled={enabledOf(rule)}
							canToggle={rowActions.canEdit && !toggle.isPending}
							onToggle={(enabled) => toggle.mutate({ id: rule.id, enabled })}
							menu={
								<RuleRowMenu
									rule={rule}
									actions={rowActions}
									isFirst={order === 1}
									isLast={order === rules.length}
									onMove={(move) =>
										reorder.mutate({
											ids: moveRule({ ids, id: rule.id, move }),
										})
									}
								/>
							}
						/>
					))}
				</SettingsTable>
			) : (
				<ApprovalRulesEmpty title="No rules match this filter" />
			)}
		</div>
	);
};
