import { TagIcon } from "@phosphor-icons/react";
import { RemoveButton } from "@/components/v2/rule-builder/RemoveButton";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";

export const DIMENSION_NAME_COLUMN = "flex items-center gap-1.5 w-32 shrink-0";

interface CreditDimensionFieldRowProps {
	field: string;
	values: string[];
	onAddValue: (value: string) => void;
	onRemoveValue: (value: string) => void;
	onRemove: () => void;
}

/** Migration filter-row rhythm: bare name on the left, one chip control taking the rest, remove on hover. */
export function CreditDimensionFieldRow({
	field,
	values,
	onAddValue,
	onRemoveValue,
	onRemove,
}: CreditDimensionFieldRowProps) {
	return (
		<div className="group/row flex items-center gap-2">
			<span className={DIMENSION_NAME_COLUMN}>
				<TagIcon size={14} className="shrink-0 text-tertiary-foreground" />
				<span className="text-sm truncate">{field}</span>
			</span>
			<ValueChipInput
				aria-label={`${field} values`}
				className="flex-1"
				values={values}
				onAdd={onAddValue}
				onRemove={onRemoveValue}
				placeholder="eg. small, press enter"
			/>
			<RemoveButton onClick={onRemove} />
		</div>
	);
}
