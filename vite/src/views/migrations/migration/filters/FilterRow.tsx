import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { BooleanPill } from "../shared/BooleanPill";
import { RemoveButton } from "../shared/RemoveButton";
import { ValuePicker } from "../shared/ValuePicker";
import {
	FIELD_CONFIGS,
	FILTER_FIELD_OPTIONS,
	type FilterField,
	type FilterOperator,
	type FilterRule,
} from "./filterRowTypes";

type ConnectorLabel = "Where" | "And" | "Or";

export function FilterRow({
	rule,
	connector,
	onConnectorClick,
	onChange,
	onRemove,
	suggestions,
}: {
	rule: FilterRule;
	connector: ConnectorLabel;
	onConnectorClick?: () => void;
	onChange: (rule: FilterRule) => void;
	onRemove: () => void;
	suggestions?: { value: string; label: string }[];
}) {
	const config = FIELD_CONFIGS[rule.field];

	return (
		<div className="flex items-center gap-2.5 group/row py-1">
			<ConnectorBadge label={connector} onClick={onConnectorClick} />

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
			>
				<SelectTrigger className="h-7 text-xs min-w-28 px-3 shrink-0">
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
				<Select
					value={rule.operator}
					onValueChange={(v) =>
						onChange({ ...rule, operator: v as FilterOperator })
					}
				>
					<SelectTrigger className="h-7 text-xs min-w-16 px-3 shrink-0">
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
			) : (
				<span className="text-xs text-t3 shrink-0 px-1">
					{config.operators[0].label}
				</span>
			)}

			<FilterValueControl
				rule={rule}
				valueType={config.valueType}
				onChange={onChange}
				suggestions={suggestions}
			/>

			<RemoveButton onClick={onRemove} />
		</div>
	);
}

function ConnectorBadge({
	label,
	onClick,
}: {
	label: ConnectorLabel;
	onClick?: () => void;
}) {
	if (!onClick) {
		return (
			<span className="text-xs text-t4 w-12 shrink-0 select-none">{label}</span>
		);
	}

	return (
		<Button
			variant="skeleton"
			size="sm"
			onClick={onClick}
			className="w-12 shrink-0 !gap-1 !justify-start text-t4 hover:text-t2"
			title={`Click to change to ${label === "And" ? "Or" : "And"}`}
		>
			{label}
			<ArrowsClockwiseIcon size={10} className="opacity-40" />
		</Button>
	);
}

function FilterValueControl({
	rule,
	valueType,
	onChange,
	suggestions,
}: {
	rule: FilterRule;
	valueType: string;
	onChange: (rule: FilterRule) => void;
	suggestions?: { value: string; label: string }[];
}) {
	if (valueType === "none") return null;

	if (valueType === "boolean") {
		return (
			<BooleanPill
				value={rule.values[0] === "true"}
				onChange={(val) => onChange({ ...rule, values: [String(val)] })}
			/>
		);
	}

	if (suggestions && suggestions.length > 0) {
		const inferOperator = (values: string[]): FilterOperator => {
			if (values.length > 1 && rule.operator === "is") return "in";
			if (values.length > 1 && rule.operator === "is_not") return "not_in";
			if (values.length <= 1 && rule.operator === "in") return "is";
			if (values.length <= 1 && rule.operator === "not_in") return "is_not";
			return rule.operator;
		};
		return (
			<ValuePicker
				suggestions={suggestions}
				selectedValues={rule.values}
				onToggle={(toggled) => {
					const isSelected = rule.values.includes(toggled);
					const next = isSelected
						? rule.values.filter((v) => v !== toggled)
						: [...rule.values, toggled];
					onChange({ ...rule, operator: inferOperator(next), values: next });
				}}
				onRemove={(removed) => {
					const next = rule.values.filter((v) => v !== removed);
					onChange({ ...rule, operator: inferOperator(next), values: next });
				}}
			/>
		);
	}

	return (
		<input
			className="h-7 text-xs rounded-lg px-3 border border-border bg-transparent outline-none w-32 text-t1 placeholder:text-t3"
			placeholder="Value"
			value={rule.values[0] ?? ""}
			onChange={(e) => onChange({ ...rule, values: [e.target.value] })}
		/>
	);
}
