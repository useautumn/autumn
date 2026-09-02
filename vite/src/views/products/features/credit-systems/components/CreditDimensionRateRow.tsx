import { GroupedTabButton, IconButton, Input } from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import {
	type CreditPriceListRow,
	rateKindOf,
	setRateKind,
} from "../utils/creditDimensionUtils";
import { CreditNumberInput } from "./CreditNumberInput";
import { CreditTierRows } from "./CreditTierRows";

const RATE_KIND_OPTIONS = [
	{ value: "flat", label: "Flat" },
	{ value: "tiered", label: "Tiered" },
];

interface CreditDimensionRateRowProps {
	property: string;
	row: CreditPriceListRow;
	onChange: (row: CreditPriceListRow) => void;
	onRemove: () => void;
}

/** `[value]  costs [n] credits` — one line of the price list; tiered opens its ladder beneath. */
export function CreditDimensionRateRow({
	property,
	row,
	onChange,
	onRemove,
}: CreditDimensionRateRowProps) {
	const { value, dimension } = row;
	const label = `${property || "value"} ${value || "(new)"}`;
	const isTiered = dimension.tier_behavior === "graduated";

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Input
					aria-label={`${label} value`}
					className="w-32 shrink-0"
					placeholder="eg. large"
					value={value}
					onChange={(event) => onChange({ ...row, value: event.target.value })}
				/>
				<span className="text-tertiary-foreground text-xs shrink-0">
					{isTiered ? "tiered" : "costs"}
				</span>
				{!isTiered && (
					<>
						<CreditNumberInput
							ariaLabel={`${label} credit cost`}
							className="w-20 shrink-0"
							placeholder="eg. 1"
							value={dimension.credit_amount}
							onValueChange={(credit_amount) =>
								onChange({ ...row, dimension: { ...dimension, credit_amount } })
							}
						/>
						<span className="text-tertiary-foreground text-xs">credits</span>
					</>
				)}
				<GroupedTabButton
					className="ml-auto shrink-0"
					value={rateKindOf(dimension)}
					onValueChange={(kind) =>
						onChange({
							...row,
							dimension: setRateKind({
								dimension,
								kind: kind as "flat" | "tiered",
							}),
						})
					}
					options={RATE_KIND_OPTIONS}
				/>
				<IconButton
					aria-label={`Remove ${label}`}
					type="button"
					variant="muted"
					className="p-1 shrink-0 text-tertiary-foreground hover:text-red-500"
					icon={<TrashIcon size={10} />}
					onClick={onRemove}
				/>
			</div>

			{dimension.tier_behavior === "graduated" && (
				<div className="pl-4">
					<CreditTierRows
						item={dimension}
						onChange={(next) => onChange({ ...row, dimension: next })}
					/>
				</div>
			)}
		</div>
	);
}
