import { IconButton, Input } from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import type { CreditAdjustmentRow as AdjustmentRow } from "../utils/creditDimensionUtils";
import { CreditNumberInput } from "./CreditNumberInput";

interface CreditAdjustmentRowProps {
	property: string;
	row: AdjustmentRow;
	onChange: (row: AdjustmentRow) => void;
	onRemove: () => void;
}

/** `[value]  × [factor]` — one line of the adjustment list. */
export function CreditAdjustmentRow({
	property,
	row,
	onChange,
	onRemove,
}: CreditAdjustmentRowProps) {
	const { value, multiplier } = row;
	const label = `${property || "adjust"} ${value || "(new)"}`;

	return (
		<div className="flex items-center gap-2">
			<Input
				aria-label={`${label} value`}
				className="flex-1 min-w-24"
				placeholder="eg. spot"
				value={value}
				onChange={(event) => onChange({ ...row, value: event.target.value })}
			/>
			<span className="text-tertiary-foreground text-xs shrink-0">×</span>
			<CreditNumberInput
				ariaLabel={`${label} factor`}
				className="w-20 shrink-0"
				placeholder="eg. 0.5"
				value={multiplier.factor}
				onValueChange={(factor) =>
					onChange({ ...row, multiplier: { ...multiplier, factor } })
				}
			/>
			<IconButton
				aria-label={`Remove ${label}`}
				type="button"
				variant="muted"
				className="ml-auto p-1 shrink-0 text-tertiary-foreground hover:text-red-500"
				icon={<TrashIcon size={10} />}
				onClick={onRemove}
			/>
		</div>
	);
}
