import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { cn } from "@/lib/utils";
import { BooleanPill } from "../shared/BooleanPill";
import { PlanVersionPicker } from "../shared/PlanVersionPicker";
import { RemoveButton } from "../shared/RemoveButton";
import { CustomerValuePicker } from "./CustomerValuePicker";
import {
	FIELD_CONFIGS,
	FILTER_FIELD_OPTIONS,
	type FieldConfig,
	type FilterField,
	type FilterOperator,
	type FilterRule,
} from "./filterRowTypes";

function inferOperator(current: FilterOperator, count: number): FilterOperator {
	if (count > 1 && current === "is") return "in";
	if (count > 1 && current === "is_not") return "not_in";
	if (count <= 1 && current === "in") return "is";
	if (count <= 1 && current === "not_in") return "is_not";
	return current;
}

export function FilterRow({
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
	const config = FIELD_CONFIGS[rule.field];

	const handleValuesChange = (next: string[]) =>
		onChange({
			...rule,
			operator: inferOperator(rule.operator, next.length),
			values: next,
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
				onValueChange={(v) => {
					const newConfig = FIELD_CONFIGS[v as FilterField];
					onChange({
						field: v as FilterField,
						operator: newConfig.operators[0].value,
						values: [],
					});
				}}
				items={FILTER_FIELD_OPTIONS}
				defaultOpen={defaultOpenField}
			>
				<SelectTrigger className="h-8 text-sm min-w-28 px-3 shrink-0">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{FILTER_FIELD_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{config.operators.length > 1 ? (
				<div className={config.valueType === "none" ? "flex-1" : "shrink-0"}>
					<Select
						value={rule.operator}
						onValueChange={(v) =>
							onChange({ ...rule, operator: v as FilterOperator })
						}
						items={config.operators}
					>
						<SelectTrigger className="h-8 text-sm min-w-16 w-full px-3">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{config.operators.map((op) => (
								<SelectItem key={op.value} value={op.value}>
									{op.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : (
				<span
					className={cn(
						"text-sm text-tertiary-foreground px-1",
						config.valueType === "none" ? "flex-1" : "shrink-0",
					)}
				>
					{config.operators[0].label}
				</span>
			)}

			<FilterValueInput
				config={config}
				rule={rule}
				onChange={onChange}
				onValuesChange={handleValuesChange}
			/>

			<RemoveButton onClick={onRemove} />
		</div>
	);
}

function FilterValueInput({
	config,
	rule,
	onChange,
	onValuesChange,
}: {
	config: FieldConfig;
	rule: FilterRule;
	onChange: (rule: FilterRule) => void;
	onValuesChange: (values: string[]) => void;
}) {
	if (config.valueType === "none") return null;
	// `none` (has no plans) takes no value.
	if (rule.operator === "none") return null;

	if (config.valueType === "customer")
		return (
			<CustomerValuePicker
				className="flex-1"
				selectedValues={rule.values}
				onChange={onValuesChange}
			/>
		);

	if (config.valueType === "plan")
		return (
			<PlanVersionPicker
				className="flex-1"
				onChange={onValuesChange}
				values={rule.values}
			/>
		);

	if (config.valueType === "boolean")
		return (
			<div className="flex-1">
				<BooleanPill
					value={rule.values[0] === "true"}
					onChange={(val) => onChange({ ...rule, values: [String(val)] })}
				/>
			</div>
		);

	return (
		<input
			className="h-8 text-sm rounded-xl px-3 input-base flex-1 min-w-0 text-foreground placeholder:text-tertiary-foreground"
			placeholder="Value"
			value={rule.values[0] ?? ""}
			onChange={(e) => onChange({ ...rule, values: [e.target.value] })}
		/>
	);
}
