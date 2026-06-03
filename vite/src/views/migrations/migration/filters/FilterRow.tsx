import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { cn } from "@/lib/utils";
import { BooleanPill } from "../shared/BooleanPill";
import { RemoveButton } from "../shared/RemoveButton";
import { ValuePicker } from "../shared/ValuePicker";
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
	suggestions,
	defaultOpenField = false,
}: {
	rule: FilterRule;
	connector?: "And";
	onChange: (rule: FilterRule) => void;
	onRemove: () => void;
	suggestions?: { value: string; label: string }[];
	defaultOpenField?: boolean;
}) {
	const config = FIELD_CONFIGS[rule.field];
	const fieldLabel =
		FILTER_FIELD_OPTIONS.find((f) => f.value === rule.field)?.label ??
		rule.field;

	const handleToggle = (toggled: string) => {
		const isSelected = rule.values.includes(toggled);
		const next = isSelected
			? rule.values.filter((v) => v !== toggled)
			: [...rule.values, toggled];
		onChange({
			...rule,
			operator: inferOperator(rule.operator, next.length),
			values: next,
		});
	};

	const handleChipRemove = (removed: string) => {
		const next = rule.values.filter((v) => v !== removed);
		onChange({
			...rule,
			operator: inferOperator(rule.operator, next.length),
			values: next,
		});
	};

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
				fieldLabel={fieldLabel}
				suggestions={suggestions}
				onChange={onChange}
				onToggle={handleToggle}
				onChipRemove={handleChipRemove}
			/>

			<RemoveButton onClick={onRemove} />
		</div>
	);
}

function FilterValueInput({
	config,
	rule,
	fieldLabel,
	suggestions,
	onChange,
	onToggle,
	onChipRemove,
}: {
	config: FieldConfig;
	rule: FilterRule;
	fieldLabel: string;
	suggestions?: { value: string; label: string }[];
	onChange: (rule: FilterRule) => void;
	onToggle: (value: string) => void;
	onChipRemove: (value: string) => void;
}) {
	if (config.valueType === "none") return null;
	// `none` (has no plans) takes no value.
	if (rule.operator === "none") return null;

	if (config.valueType === "boolean")
		return (
			<div className="flex-1">
				<BooleanPill
					value={rule.values[0] === "true"}
					onChange={(val) => onChange({ ...rule, values: [String(val)] })}
				/>
			</div>
		);

	if (config.valueType === "number") {
		const isMulti = rule.operator === "in" || rule.operator === "not_in";
		if (isMulti)
			return (
				<input
					className="h-8 text-sm rounded-xl px-3 input-base flex-1 min-w-0 text-foreground placeholder:text-tertiary-foreground"
					placeholder="1, 2, 3"
					value={rule.values.join(", ")}
					onChange={(e) =>
						onChange({
							...rule,
							values: e.target.value
								.split(",")
								.map((s) => s.trim())
								.filter(Boolean),
						})
					}
				/>
			);
		return (
			<input
				type="number"
				className="h-8 text-sm rounded-xl px-3 input-base flex-1 min-w-0 text-foreground placeholder:text-tertiary-foreground"
				placeholder="Number"
				value={rule.values[0] ?? ""}
				onChange={(e) =>
					onChange({
						...rule,
						values: e.target.value === "" ? [] : [e.target.value],
					})
				}
			/>
		);
	}

	if (suggestions && suggestions.length > 0)
		return (
			<ValuePicker
				className="flex-1"
				suggestions={suggestions}
				selectedValues={rule.values}
				placeholder={`Select ${fieldLabel.toLowerCase()}...`}
				onToggle={onToggle}
				onRemove={onChipRemove}
			/>
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
