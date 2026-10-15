import type { ApprovalRule } from "@autumn/shared";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@autumn/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SettingsTable } from "../../SettingsTable";
import { ApprovalRuleRow } from "./ApprovalRuleRow";
import { ApprovalRulesEmpty } from "./ApprovalRulesEmpty";
import { useApprovalRuleRows } from "./useApprovalRuleRows";

const COLUMNS = [
	{ label: "Rule", width: "85%" },
	{ label: "Enabled", width: "10%" },
];

export const ApprovalRulesTable = ({ rules }: { rules: ApprovalRule[] }) => {
	const [filter, setFilter] = useState("");
	const rows = useApprovalRuleRows({ rules, filter });
	const enabledCount = rules.filter((rule) => rule.enabled).length;

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
					{rows.map(({ rule, parts }) => (
						<ApprovalRuleRow key={rule.id} rule={rule} parts={parts} />
					))}
				</SettingsTable>
			) : (
				<ApprovalRulesEmpty title="No rules match this filter" />
			)}
		</div>
	);
};
