import type { CreditAdjustmentRow as AdjustmentRow } from "../utils/creditDimensionUtils";
import { CreditNumberInput } from "./CreditNumberInput";

interface CreditAdjustmentRowProps {
	property: string;
	row: AdjustmentRow;
	onChange: (row: AdjustmentRow) => void;
}

/** `value   × [factor]` — one line of the adjustment list. */
export function CreditAdjustmentRow({
	property,
	row,
	onChange,
}: CreditAdjustmentRowProps) {
	const { value, multiplier } = row;

	return (
		<div className="flex items-center gap-2">
			<span className="w-32 shrink-0 truncate text-sm" title={value}>
				{value}
			</span>
			<span className="text-tertiary-foreground text-xs shrink-0">×</span>
			<CreditNumberInput
				ariaLabel={`${property} ${value} factor`}
				className="w-20 shrink-0"
				placeholder="eg. 0.5"
				value={multiplier.factor}
				onValueChange={(factor) =>
					onChange({ ...row, multiplier: { ...multiplier, factor } })
				}
			/>
		</div>
	);
}
