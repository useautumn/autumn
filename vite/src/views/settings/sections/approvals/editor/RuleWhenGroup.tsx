import { FilterRow } from "@/components/filters/FilterRow";
import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import type { RuleRowItem } from "./ruleEditorValues";
import type { RuleFieldRegistry } from "./ruleFieldRegistry";
import { fitOperatorToValues } from "./ruleRowCodec";
import { RULE_VALUE_INPUTS } from "./values/ruleValueInputs";

import { WhenHeader } from "./WhenHeader";

/** One OR group: AND-ed rows from U1's builder. */
export const RuleWhenGroup = ({
	registry,
	label,
	rows,
	onChange,
	onRemove,
	followsPinned = false,
}: {
	registry: RuleFieldRegistry;
	label?: string;
	rows: RuleRowItem[];
	onChange: (rows: RuleRowItem[]) => void;
	onRemove?: () => void;
	/** The pinned Feature row sits above, so the first row also reads "And". */
	followsPinned?: boolean;
}) => (
	<div className="flex flex-col gap-2">
		{label && (
			<div className="group/row flex items-center justify-between">
				<WhenHeader label={label} count={rows.length} />
				{onRemove && <RemoveButton onClick={onRemove} />}
			</div>
		)}
		{rows.map((row, index) => (
			<div key={row.id}>
				<FilterRow
					registry={registry}
					valueInputs={RULE_VALUE_INPUTS}
					rule={row}
					connector={index > 0 || followsPinned ? "And" : undefined}
					onChange={(next) => {
						const operators = registry
							.getField(next.field)
							.operators.map((option) => option.value);
						const fitted = fitOperatorToValues({ row: next, operators });
						onChange(
							rows.map((existing, i) =>
								i === index ? { ...fitted, id: existing.id } : existing,
							),
						);
					}}
					onRemove={() => onChange(rows.filter((_, i) => i !== index))}
				/>
			</div>
		))}
	</div>
);
