import { Input } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useDraftValue } from "@/components/v2/rule-builder/useDraftValue";
import type { DimensionValues } from "../utils/creditDimensionUtils";
import {
	CreditDimensionFieldRow,
	DIMENSION_NAME_COLUMN,
} from "./CreditDimensionFieldRow";

interface CreditDimensionFieldsProps {
	values: DimensionValues;
	onAddField: (field: string) => void;
	onRemoveField: (field: string) => void;
	onAddValue: (field: string, value: string) => void;
	onRemoveValue: (field: string, value: string) => void;
}

/** One row per field; the trailing row is a bare input that adds a field on enter. */
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
			<div className={`${DIMENSION_NAME_COLUMN} h-8`}>
				<PlusIcon
					size={14}
					weight="bold"
					className="shrink-0 text-tertiary-foreground"
				/>
				<Input
					{...newField.inputProps}
					variant="headless"
					aria-label="New dimension"
					className="h-auto! text-sm"
					placeholder="Add dimension"
				/>
			</div>
		</div>
	);
}
