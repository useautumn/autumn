import type { CreditSchemaItem } from "@autumn/shared";
import { IconButton, Input } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditAdjustmentRow } from "./CreditAdjustmentRow";
import { CreditDimensionRateRow } from "./CreditDimensionRateRow";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

function AddValueButton({
	onClick,
	disabled,
}: {
	onClick: () => void;
	disabled: boolean;
}) {
	return (
		<IconButton
			type="button"
			variant="muted"
			size="sm"
			className="w-full text-tertiary-foreground text-xs"
			icon={<PlusIcon size={10} />}
			onClick={onClick}
			disabled={disabled}
		>
			Add value
		</IconButton>
	);
}

/** One property → a price per value, with the row's own rate as "anything else". */
export function CreditDimensionPriceList({
	item,
	onChange,
}: CreditDimensionPriceListProps) {
	const editor = useCreditDimensionEditor({ item, onChange });

	if (editor.readOnly) {
		return (
			<span className="text-xs text-tertiary-foreground">
				These dimensions were configured through the API and can only be edited
				there.
			</span>
		);
	}

	const baseRate =
		item.tier_behavior === "graduated"
			? "the row's tiered rate"
			: `${item.credit_amount ?? 0} credits`;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<span className="text-tertiary-foreground text-xs shrink-0 w-14">
						property
					</span>
					<Input
						aria-label="Dimension property"
						className="w-48"
						placeholder="eg. size"
						value={editor.property}
						onChange={(event) => editor.setProperty(event.target.value)}
					/>
				</div>

				{editor.rates.map((row, index) => (
					<CreditDimensionRateRow
						key={index}
						property={editor.property}
						row={row}
						onChange={(next) => editor.setRate(index, next)}
						onRemove={() => editor.removeRate(index)}
					/>
				))}

				<div className="flex items-center gap-2 text-xs text-tertiary-foreground">
					<span className="w-32 shrink-0">anything else</span>
					<span>costs {baseRate}</span>
				</div>

				<AddValueButton
					onClick={editor.addRate}
					disabled={editor.property.trim() === ""}
				/>
			</div>

			{editor.showAdjustments ? (
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<span className="text-tertiary-foreground text-xs shrink-0 w-14">
							adjust by
						</span>
						<Input
							aria-label="Adjustment property"
							className="w-48"
							placeholder="eg. lifecycle"
							value={editor.adjustProperty}
							onChange={(event) => editor.setAdjustProperty(event.target.value)}
						/>
					</div>

					{editor.adjustments.map((row, index) => (
						<CreditAdjustmentRow
							key={index}
							property={editor.adjustProperty}
							row={row}
							onChange={(next) => editor.setAdjustment(index, next)}
							onRemove={() => editor.removeAdjustment(index)}
						/>
					))}

					<AddValueButton
						onClick={editor.addAdjustment}
						disabled={editor.adjustProperty.trim() === ""}
					/>
				</div>
			) : (
				<button
					type="button"
					className="w-fit text-xs text-tertiary-foreground hover:text-foreground transition-colors"
					onClick={editor.showAdjustmentList}
				>
					+ Adjust by another property
				</button>
			)}
		</div>
	);
}
