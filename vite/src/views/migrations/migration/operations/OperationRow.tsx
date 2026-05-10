import { Input } from "@/components/v2/inputs/Input";
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

export type OperationFieldConfig = {
	label: string;
	valueType: "string" | "number" | "boolean" | "enum" | "select";
	enumOptions?: { value: string; label: string }[];
	suggestions?: { value: string; label: string }[];
	placeholder?: string;
};

export function OperationRow({
	connector,
	fieldLabel,
	value,
	config,
	onChange,
	onRemove,
}: {
	connector: string;
	fieldLabel: string;
	value: string;
	config: OperationFieldConfig;
	onChange: (value: string) => void;
	onRemove?: () => void;
}) {
	return (
		<div className="flex items-center gap-2.5 group/row py-1">
			<span className="text-xs text-t3 w-12 shrink-0 select-none">
				{connector || "\u00A0"}
			</span>
			<span className="text-xs text-t2 min-w-20 shrink-0 font-medium">
				{fieldLabel}
			</span>
			<span className="text-xs text-t3 shrink-0">is</span>

			<OperationValueControl
				value={value}
				config={config}
				onChange={onChange}
			/>

			{onRemove ? (
				<RemoveButton onClick={onRemove} />
			) : (
				<div className="w-7 shrink-0" />
			)}
		</div>
	);
}

function OperationValueControl({
	value,
	config,
	onChange,
}: {
	value: string;
	config: OperationFieldConfig;
	onChange: (value: string) => void;
}) {
	if (config.valueType === "boolean") {
		return (
			<BooleanPill
				value={value === "true"}
				onChange={(val) => onChange(String(val))}
			/>
		);
	}

	if (config.valueType === "enum" && config.enumOptions) {
		return (
			<Select
				value={value || "__none__"}
				onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
			>
				<SelectTrigger className="h-7 text-xs min-w-28 px-3">
					<SelectValue placeholder={config.placeholder ?? "Select..."} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="__none__">
						<span className="text-t3">{config.placeholder ?? "Select..."}</span>
					</SelectItem>
					{config.enumOptions.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		);
	}

	if (config.valueType === "select" && config.suggestions) {
		return (
			<ValuePicker
				suggestions={config.suggestions}
				selectedValues={value ? [value] : []}
				onToggle={(toggled) => onChange(toggled === value ? "" : toggled)}
				onRemove={() => onChange("")}
				placeholder={config.placeholder}
			/>
		);
	}

	return (
		<Input
			className="h-7 text-xs w-28"
			type={config.valueType === "number" ? "number" : "text"}
			placeholder={config.placeholder ?? ""}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}
