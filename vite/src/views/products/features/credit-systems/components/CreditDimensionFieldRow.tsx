import { IconButton } from "@autumn/ui";
import { TagIcon, TrashIcon } from "@phosphor-icons/react";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";

export const DIMENSION_NAME_WIDTH = "w-36";

interface CreditDimensionFieldRowProps {
	field: string;
	values: string[];
	onAddValue: (value: string) => void;
	onRemoveValue: (value: string) => void;
	onRemove: () => void;
}

/** Two cards on one line: the field's name, then its values as chips; delete shows on hover. */
export function CreditDimensionFieldRow({
	field,
	values,
	onAddValue,
	onRemoveValue,
	onRemove,
}: CreditDimensionFieldRowProps) {
	return (
		<div className="group flex items-center gap-2">
			<span
				className={`flex items-center gap-1.5 h-8 px-3 rounded-xl border bg-interactive-secondary shrink-0 min-w-0 select-none ${DIMENSION_NAME_WIDTH}`}
			>
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
			<IconButton
				aria-label={`Remove ${field}`}
				type="button"
				variant="skeleton"
				iconOrientation="center"
				icon={<TrashIcon size={16} weight="regular" />}
				className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-red-500"
				onClick={onRemove}
				tabIndex={-1}
			/>
		</div>
	);
}
