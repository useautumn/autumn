import { CubeIcon, PlusIcon, UserIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusSearchQueryV2 } from "@/views/customers/hooks/useCusSearchQuery";
import { buildFeatureSuggestions } from "../shared/featureSuggestions";
import type { ValuePickerOption } from "../shared/ValuePicker";
import { FilterRow } from "./FilterRow";
import {
	FIELD_CONFIGS,
	FILTER_FIELD_OPTIONS,
	type FilterField,
	type FilterGroupData,
	type FilterRule,
} from "./filterRowTypes";

const BILLING_METHOD_SUGGESTIONS: ValuePickerOption[] = [
	{ value: "prepaid", label: "Prepaid" },
	{ value: "usage_based", label: "Usage Based" },
];

const ITEM_MODE_SUGGESTIONS: ValuePickerOption[] = [
	{ value: "some", label: "Any match (some)" },
	{ value: "every", label: "All match (every)" },
	{ value: "none", label: "None match (none)" },
];

function useSuggestionsForField(
	field: string,
): ValuePickerOption[] | undefined {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customers } = useCusSearchQueryV2({
		search: "",
		page: 1,
		page_size: 250,
	});

	if (field === "customer_id") {
		return customers
			.filter((c) => c.id)
			.map((c) => ({
				value: c.id!,
				label: c.name ?? c.email ?? c.id!,
				icon: <UserIcon size={14} className="text-t3" />,
			}));
	}
	if (field === "plan_id") {
		const seen = new Set<string>();
		return products
			.filter((p) => {
				if (seen.has(p.id)) return false;
				seen.add(p.id);
				return true;
			})
			.map((p) => ({
				value: p.id,
				label: p.name || p.id,
				icon: <CubeIcon size={14} weight="duotone" className="text-t3" />,
			}));
	}
	if (field === "item_feature_id") {
		return buildFeatureSuggestions(features);
	}
	if (field === "item_billing_method") return BILLING_METHOD_SUGGESTIONS;
	if (field === "item_mode") return ITEM_MODE_SUGGESTIONS;
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
	onSplitAt,
	showDelete,
}: {
	group: FilterGroupData;
	onChange: (group: FilterGroupData) => void;
	onDelete: () => void;
	onSplitAt?: (index: number) => void;
	showDelete: boolean;
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
		<div className="flex flex-col">
			{group.rules.map((rule, index) => (
				<FilterRowWithSuggestions
					key={`rule-${index}`}
					rule={rule}
					connector={index === 0 ? "Where" : "And"}
					onConnectorClick={
						index > 0 && onSplitAt ? () => onSplitAt(index) : undefined
					}
					onChange={(updated) => updateRule(index, updated)}
					onRemove={() => removeRule(index)}
				/>
			))}
			<div className="flex items-center justify-between pt-1 pl-[3.625rem]">
				<Button variant="skeleton" size="sm" onClick={addRule} className="text-t4 hover:text-t2">
					<PlusIcon size={10} />
					Add filter
				</Button>
				{showDelete && (
					<Button
						variant="skeleton"
						size="sm"
						onClick={onDelete}
						className="text-t4 hover:text-destructive"
					>
						Remove group
					</Button>
				)}
			</div>
		</div>
	);
}

function FilterRowWithSuggestions({
	rule,
	connector,
	onConnectorClick,
	onChange,
	onRemove,
}: {
	rule: FilterRule;
	connector: "Where" | "And" | "Or";
	onConnectorClick?: () => void;
	onChange: (rule: FilterRule) => void;
	onRemove: () => void;
}) {
	const suggestions = useSuggestionsForField(rule.field);
	return (
		<FilterRow
			rule={rule}
			connector={connector}
			onConnectorClick={onConnectorClick}
			onChange={onChange}
			onRemove={onRemove}
			suggestions={suggestions}
		/>
	);
}
