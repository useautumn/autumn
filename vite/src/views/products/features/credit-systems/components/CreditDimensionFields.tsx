import { Input } from "@autumn/ui";
import { useDraftValue } from "@/components/v2/rule-builder/useDraftValue";
import type { DimensionValues } from "../utils/creditDimensionUtils";
import { CreditDimensionFieldRow } from "./CreditDimensionFieldRow";

interface CreditDimensionFieldsProps {
	values: DimensionValues;
	onAddField: (field: string) => void;
	onRemoveField: (field: string) => void;
	onAddValue: (field: string, value: string) => void;
	onRemoveValue: (field: string, value: string) => void;
}

/** A row card per field with its values as chips; typing a name beneath adds a field. */
export function CreditDimensionFields({
	values,
	onAddField,
	onRemoveField,
	onAddValue,
	onRemoveValue,
}: CreditDimensionFieldsProps) {
	const newField = useDraftValue({
		onSubmit: (field) => {
			if (!(field in values)) onAddField(field);
		},
	});

	return (
		<div className="flex flex-col gap-2">
			{Object.entries(values).map(([field, fieldValues]) => (
				<CreditDimensionFieldRow
					key={field}
					field={field}
					values={fieldValues}
					onAddValue={(value) => onAddValue(field, value)}
					onRemoveValue={(value) => onRemoveValue(field, value)}
					onRemove={() => onRemoveField(field)}
				/>
			))}
			<Input
				{...newField.inputProps}
				aria-label="New dimension"
				className="h-8! rounded-xl px-3"
				placeholder="Add a dimension, eg. size"
			/>
		</div>
	);
}
