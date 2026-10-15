import type { EditorRowIssue } from "@autumn/shared";
import { FilterRow } from "@/components/filters/FilterRow";
import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import type { RuleFieldRegistry } from "./ruleFieldRegistry";
import { fitOperatorToValues, type RuleRow } from "./ruleRowCodec";
import { RULE_VALUE_INPUTS } from "./values/ruleValueInputs";

import { WhenHeader } from "./WhenHeader";

/** One OR group: AND-ed rows from U1's builder, each with its save issue underneath. */
export const RuleWhenGroup = ({
	registry,
	label,
	rows,
	issues,
	onChange,
	onRemove,
}: {
	registry: RuleFieldRegistry;
	label?: string;
	rows: RuleRow[];
	issues: EditorRowIssue[];
	onChange: (rows: RuleRow[]) => void;
	onRemove?: () => void;
}) => (
	<div className="flex flex-col gap-2">
		{label && (
			<div className="group/row flex items-center justify-between">
				<WhenHeader label={label} count={rows.length} />
				{onRemove && <RemoveButton onClick={onRemove} />}
			</div>
		)}
		{rows.map((row, index) => (
			<div key={`${index}-${row.field}`} className="flex flex-col gap-1">
				<FilterRow
					registry={registry}
					valueInputs={RULE_VALUE_INPUTS}
					rule={row}
					connector={index > 0 ? "And" : undefined}
					onChange={(next) => {
						const operators = registry
							.getField(next.field)
							.operators.map((option) => option.value);
						const fitted = fitOperatorToValues({ row: next, operators });
						onChange(
							rows.map((existing, i) => (i === index ? fitted : existing)),
						);
					}}
					onRemove={() => onChange(rows.filter((_, i) => i !== index))}
				/>
				{issues
					.filter((issue) => issue.row === index)
					.map((issue) => (
						<p key={issue.message} className="pl-10 text-destructive text-xs">
							{issue.message}
						</p>
					))}
			</div>
		))}
	</div>
);
