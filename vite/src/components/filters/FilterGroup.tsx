import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import { AddButton } from "@/views/migrations/migration/shared/AddButton";
import { FilterRow } from "./FilterRow";
import type {
	FilterRegistry,
	FilterRow as FilterRowData,
	FilterRowGroup,
	FilterValueInputs,
} from "./types";

export function FilterGroup<TFilter, TPath extends string, TOp extends string>({
	registry,
	valueInputs,
	group,
	onChange,
	onDelete,
	showDelete,
	groupIndex,
	autoOpenField = false,
}: {
	registry: FilterRegistry<TFilter, TPath, TOp>;
	valueInputs: FilterValueInputs;
	group: FilterRowGroup<TPath, TOp>;
	onChange: (group: FilterRowGroup<TPath, TOp>) => void;
	onDelete: () => void;
	showDelete: boolean;
	groupIndex: number;
	autoOpenField?: boolean;
}) {
	const updateRule = (index: number, rule: FilterRowData<TPath, TOp>) => {
		const newRules = [...group.rules];
		newRules[index] = rule;
		onChange({ rules: newRules });
	};

	const removeRule = (index: number) => {
		const newRules = group.rules.filter((_, i) => i !== index);
		onChange({ rules: newRules });
	};

	const addRule = () => {
		onChange({
			rules: [...group.rules, registry.nextRow({ rows: group.rules })],
		});
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between group/row">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-foreground">
						{groupIndex === 0 ? "Where" : "Or"}
					</span>
					{group.rules.length > 0 && (
						<span className="text-xs text-tertiary-foreground">
							{group.rules.length}{" "}
							{group.rules.length === 1 ? "condition" : "conditions"}
						</span>
					)}
				</div>
				{showDelete && <RemoveButton onClick={onDelete} />}
			</div>
			{group.rules.map((rule, index) => (
				<FilterRow
					key={`rule-${index}`}
					registry={registry}
					valueInputs={valueInputs}
					rule={rule}
					connector={index > 0 ? "And" : undefined}
					onChange={(updated) => updateRule(index, updated)}
					onRemove={() => removeRule(index)}
					defaultOpenField={index === 0 && autoOpenField}
				/>
			))}
			<AddButton
				label={group.rules.length === 0 ? "Add condition" : "AND condition"}
				onClick={addRule}
				className="mt-1"
			/>
		</div>
	);
}
