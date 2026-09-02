import { IconButton } from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";

interface CreditDimensionFieldRowProps {
	field: string;
	values: string[];
	onAddValue: (value: string) => void;
	onRemoveValue: (value: string) => void;
	onRemove: () => void;
}

/** A plan-row style card: the field name leads, its values are chips, delete shows on hover. */
export function CreditDimensionFieldRow({
	field,
	values,
	onAddValue,
	onRemoveValue,
	onRemove,
}: CreditDimensionFieldRowProps) {
	return (
		<ValueChipInput
			aria-label={`${field} values`}
			className="group h-10"
			leading={
				<span className="text-sm w-16 shrink-0 truncate select-none">
					{field}
				</span>
			}
			trailing={
				<IconButton
					aria-label={`Remove ${field}`}
					type="button"
					variant="skeleton"
					iconOrientation="center"
					icon={<TrashIcon size={16} weight="regular" />}
					className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-red-500"
					onClick={(event) => {
						event.stopPropagation();
						onRemove();
					}}
					tabIndex={-1}
				/>
			}
			values={values}
			onAdd={onAddValue}
			onRemove={onRemoveValue}
			placeholder="eg. small, press enter"
		/>
	);
}
