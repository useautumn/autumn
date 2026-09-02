import { IconButton } from "@autumn/ui";
import { X } from "lucide-react";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";

interface CreditDimensionFieldRowProps {
	field: string;
	values: string[];
	onAddValue: (value: string) => void;
	onRemoveValue: (value: string) => void;
	onRemove: () => void;
}

export function CreditDimensionFieldRow({
	field,
	values,
	onAddValue,
	onRemoveValue,
	onRemove,
}: CreditDimensionFieldRowProps) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm w-24 shrink-0 truncate">{field}</span>
			<ValueChipInput
				aria-label={`${field} values`}
				className="flex-1"
				values={values}
				onAdd={onAddValue}
				onRemove={onRemoveValue}
				placeholder="eg. small, press enter"
			/>
			<IconButton
				aria-label={`Remove ${field}`}
				type="button"
				variant="skeleton"
				iconOrientation="center"
				icon={<X className="h-3.5 w-3.5" />}
				onClick={onRemove}
				className="!text-subtle hover:!text-foreground"
			/>
		</div>
	);
}
