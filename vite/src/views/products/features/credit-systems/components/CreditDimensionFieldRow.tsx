import { IconButton } from "@autumn/ui";
import { TagIcon, TrashIcon } from "@phosphor-icons/react";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";

interface CreditDimensionFieldRowProps {
	field: string;
	values: string[];
	onAddValue: (value: string) => void;
	onRemoveValue: (value: string) => void;
	onRemove: () => void;
}

/** A plan-row style card: icon and name lead, a divider, then the values as chips; delete shows on hover. */
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
			className="group"
			leading={
				<>
					<span className="flex items-center gap-1.5 w-24 shrink-0 min-w-0 select-none">
						<TagIcon size={14} className="shrink-0 text-tertiary-foreground" />
						<span className="text-sm truncate">{field}</span>
					</span>
					<span className="w-px h-4 bg-border shrink-0" />
				</>
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
