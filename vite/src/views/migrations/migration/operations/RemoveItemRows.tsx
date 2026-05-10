import { BILLING_METHOD_OPTIONS, INTERVAL_OPTIONS } from "../shared/constants";
import { OperationRow } from "./OperationRow";

export function RemoveItemRows({
	item,
	featureSuggestions,
	onChange,
	onRemove,
}: {
	item: Record<string, unknown>;
	featureSuggestions: { value: string; label: string }[];
	onChange: (item: Record<string, unknown>) => void;
	onRemove: () => void;
}) {
	return (
		<>
			<OperationRow
				connector="Remove"
				fieldLabel="Feature"
				value={String(item.feature_id ?? "")}
				config={{
					label: "Feature",
					valueType: "select",
					suggestions: featureSuggestions,
					placeholder: "Select feature...",
				}}
				onChange={(v) => onChange({ ...item, feature_id: v || undefined })}
				onRemove={onRemove}
			/>
			<OperationRow
				connector=""
				fieldLabel="Method"
				value={String(item.billing_method ?? "")}
				config={{
					label: "Method",
					valueType: "enum",
					enumOptions: BILLING_METHOD_OPTIONS,
				}}
				onChange={(v) => onChange({ ...item, billing_method: v || undefined })}
			/>
			<OperationRow
				connector=""
				fieldLabel="Interval"
				value={String(item.interval ?? "")}
				config={{
					label: "Interval",
					valueType: "enum",
					enumOptions: INTERVAL_OPTIONS,
				}}
				onChange={(v) => onChange({ ...item, interval: v || undefined })}
			/>
		</>
	);
}
