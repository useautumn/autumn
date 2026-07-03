import { UserIcon } from "@phosphor-icons/react";
import { useCusSearchQueryV2 } from "@/views/customers/hooks/useCusSearchQuery";
import { AddButton } from "../shared/AddButton";
import { RemoveButton } from "../shared/RemoveButton";
import type { ValuePickerOption } from "../shared/ValuePicker";
import { FilterRow } from "./FilterRow";
import {
	FIELD_CONFIGS,
	FILTER_FIELD_OPTIONS,
	type FilterField,
	type FilterGroupData,
	type FilterRule,
} from "./filterRowTypes";

function useSuggestionsForField(
	field: string,
): ValuePickerOption[] | undefined {
	const { customers } = useCusSearchQueryV2({
		search: "",
		page: 1,
		page_size: 250,
	});

	if (field === "customer_id") {
		return customers
			.filter((c): c is typeof c & { id: string } => Boolean(c.id))
			.map((c) => {
				const label = c.name ?? c.email ?? c.id;
				return {
					value: c.id,
					label,
					sublabel: label === c.id ? undefined : c.id,
					icon: <UserIcon size={14} className="text-tertiary-foreground" />,
				};
			});
	}
	return undefined;
}

function getNextAvailableField(usedFields: Set<string>): FilterRule {
	const available = FILTER_FIELD_OPTIONS.find(
		(opt) => !usedFields.has(opt.value),
	);
	const field: FilterField = available?.value ?? "plan_id";
	return {
		field,
		operator: FIELD_CONFIGS[field].operators[0].value,
		values: [],
	};
}

export function FilterGroup({
	group,
	onChange,
	onDelete,
	showDelete,
	groupIndex,
	autoOpenField = false,
}: {
	group: FilterGroupData;
	onChange: (group: FilterGroupData) => void;
	onDelete: () => void;
	showDelete: boolean;
	groupIndex: number;
	autoOpenField?: boolean;
}) {
	const updateRule = (index: number, rule: FilterRule) => {
		const newRules = [...group.rules];
		newRules[index] = rule;
		onChange({ rules: newRules });
	};

	const removeRule = (index: number) => {
		const newRules = group.rules.filter((_, i) => i !== index);
		onChange({ rules: newRules });
	};

	const addRule = () => {
		const usedFields = new Set(group.rules.map((r) => r.field));
		onChange({
			rules: [...group.rules, getNextAvailableField(usedFields)],
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
				<FilterRowWithSuggestions
					key={`rule-${index}`}
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

function FilterRowWithSuggestions({
	rule,
	connector,
	onChange,
	onRemove,
	defaultOpenField = false,
}: {
	rule: FilterRule;
	connector?: "And";
	onChange: (rule: FilterRule) => void;
	onRemove: () => void;
	defaultOpenField?: boolean;
}) {
	const suggestions = useSuggestionsForField(rule.field);
	return (
		<FilterRow
			rule={rule}
			connector={connector}
			onChange={onChange}
			onRemove={onRemove}
			suggestions={suggestions}
			defaultOpenField={defaultOpenField}
		/>
	);
}
