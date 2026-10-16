import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import { cn } from "@/lib/utils";
import { FilterRowValue } from "./FilterRowValue";
import type {
	FilterField,
	FilterRegistry,
	FilterRow as FilterRowData,
	FilterValueInputs,
} from "./types";

const MULTI_VALUE_OPERATORS: Record<string, string> = {
	is: "in",
	is_not: "not_in",
};
const SINGLE_VALUE_OPERATORS: Record<string, string> = {
	in: "is",
	not_in: "is_not",
};

/** Swaps `is` ⇄ `in` (and their negations) as the value count crosses one. */
function operatorForCount<TFilter, TPath extends string, TOp extends string>({
	field,
	operator,
	count,
}: {
	field: FilterField<TFilter, TPath, TOp>;
	operator: TOp;
	count: number;
}): TOp {
	const swaps = count > 1 ? MULTI_VALUE_OPERATORS : SINGLE_VALUE_OPERATORS;
	const swapped = field.operators.find(
		({ value }) => value === swaps[operator],
	);
	return swapped?.value ?? operator;
}

export function FilterRow<TFilter, TPath extends string, TOp extends string>({
	registry,
	valueInputs,
	rule,
	connector,
	onChange,
	onRemove,
	defaultOpenField = false,
}: {
	registry: FilterRegistry<TFilter, TPath, TOp>;
	valueInputs: FilterValueInputs;
	rule: FilterRowData<TPath, TOp>;
	connector?: "And";
	onChange: (rule: FilterRowData<TPath, TOp>) => void;
	onRemove: () => void;
	defaultOpenField?: boolean;
}) {
	const field = registry.getField(rule.field);
	const fieldOptions = registry.fields.map(({ path, label }) => ({
		value: path,
		label,
	}));
	const operator = field.operators.find(({ value }) => value === rule.operator);
	const hidesValue = field.valueInput === "none" || operator?.hidesValue;

	const handleValuesChange = (values: string[]) =>
		onChange({
			...rule,
			operator: operatorForCount({
				field,
				operator: rule.operator,
				count: values.length,
			}),
			values,
		});

	return (
		<div className="flex items-center gap-2.5 group/row">
			{connector && (
				<span className="text-xs text-subtle w-8 shrink-0 select-none">
					{connector}
				</span>
			)}

			<Select
				value={rule.field}
				onValueChange={(path) =>
					onChange(registry.createRow({ path: path as TPath }))
				}
				items={fieldOptions}
				defaultOpen={defaultOpenField}
			>
				<SelectTrigger className="h-8 text-sm min-w-28 px-3 shrink-0">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{fieldOptions.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{field.operators.length > 1 ? (
				<div className={field.valueInput === "none" ? "flex-1" : "shrink-0"}>
					<Select
						value={rule.operator}
						onValueChange={(value) =>
							onChange({ ...rule, operator: value as TOp })
						}
						items={field.operators}
					>
						<SelectTrigger className="h-8 text-sm min-w-16 w-full px-3">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{field.operators.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : (
				<span
					className={cn(
						"text-sm text-tertiary-foreground px-1",
						field.valueInput === "none" ? "flex-1" : "shrink-0",
					)}
				>
					{field.operators[0].label}
				</span>
			)}

			{!hidesValue && (
				<FilterRowValue
					valueInput={field.valueInput}
					valueInputs={valueInputs}
					values={rule.values}
					onChange={handleValuesChange}
				/>
			)}

			<RemoveButton onClick={onRemove} />
		</div>
	);
}
