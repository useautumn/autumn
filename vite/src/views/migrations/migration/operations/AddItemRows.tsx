import { AddButton } from "../shared/AddButton";
import { BILLING_METHOD_OPTIONS, INTERVAL_OPTIONS } from "../shared/constants";
import { OperationRow } from "./OperationRow";

export function AddItemRows({
	label,
	item,
	featureSuggestions,
	onChange,
	onRemove,
}: {
	label: string;
	item: Record<string, unknown>;
	featureSuggestions: { value: string; label: string }[];
	onChange: (item: Record<string, unknown>) => void;
	onRemove: () => void;
}) {
	return (
		<>
			<OperationRow
				connector={label}
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
				fieldLabel="Included"
				value={String(item.included ?? "")}
				config={{
					label: "Included",
					valueType: "number",
					placeholder: "0",
				}}
				onChange={(v) =>
					onChange({ ...item, included: v ? Number(v) : undefined })
				}
			/>
			{item.price !== undefined && (
				<>
					<OperationRow
						connector=""
						fieldLabel="Price"
						value={String(
							(item.price as Record<string, unknown>)?.amount ?? "",
						)}
						config={{
							label: "Amount",
							valueType: "number",
							placeholder: "0",
						}}
						onChange={(v) =>
							onChange({
								...item,
								price: {
									...(item.price as Record<string, unknown>),
									amount: v ? Number(v) : undefined,
								},
							})
						}
						onRemove={() => onChange({ ...item, price: undefined })}
					/>
					<OperationRow
						connector=""
						fieldLabel="Interval"
						value={String(
							(item.price as Record<string, unknown>)?.interval ?? "",
						)}
						config={{
							label: "Interval",
							valueType: "enum",
							enumOptions: INTERVAL_OPTIONS,
						}}
						onChange={(v) =>
							onChange({
								...item,
								price: {
									...(item.price as Record<string, unknown>),
									interval: v,
								},
							})
						}
					/>
					<OperationRow
						connector=""
						fieldLabel="Method"
						value={String(
							(item.price as Record<string, unknown>)?.billing_method ?? "",
						)}
						config={{
							label: "Method",
							valueType: "enum",
							enumOptions: BILLING_METHOD_OPTIONS,
						}}
						onChange={(v) =>
							onChange({
								...item,
								price: {
									...(item.price as Record<string, unknown>),
									billing_method: v || undefined,
								},
							})
						}
					/>
				</>
			)}
			{item.price === undefined && (
				<div className="py-1 pl-[3.625rem]">
					<AddButton
						label="Price"
						onClick={() => onChange({ ...item, price: {} })}
					/>
				</div>
			)}
		</>
	);
}
