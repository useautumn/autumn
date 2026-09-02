import type { CreditSchemaItem } from "@autumn/shared";
import { Input, TagInput } from "@autumn/ui";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditAdjustmentRow } from "./CreditAdjustmentRow";
import { CreditDimensionRateRow } from "./CreditDimensionRateRow";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

function PropertyValuesLine({
	property,
	propertyPlaceholder,
	values,
	onPropertyChange,
	onValuesChange,
	ariaLabel,
}: {
	property: string;
	propertyPlaceholder: string;
	values: string[];
	onPropertyChange: (property: string) => void;
	onValuesChange: (values: string[]) => void;
	ariaLabel: string;
}) {
	return (
		<div className="flex items-start gap-2">
			<Input
				aria-label={`${ariaLabel} property`}
				className="w-32 shrink-0"
				placeholder={propertyPlaceholder}
				value={property}
				onChange={(event) => onPropertyChange(event.target.value)}
			/>
			<TagInput
				aria-label={`${ariaLabel} values`}
				className="flex-1 min-w-0"
				value={values}
				onChange={onValuesChange}
				placeholder={
					property ? `Add a ${property}, press enter` : "Add a value"
				}
				disabled={property.trim() === ""}
			/>
		</div>
	);
}

/** A property and its values as pills; a rate per value below, the row's own rate as "anything else". */
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
				<PropertyValuesLine
					ariaLabel="Dimension"
					property={editor.property}
					propertyPlaceholder="eg. size"
					values={editor.rates.map((row) => row.value)}
					onPropertyChange={editor.setProperty}
					onValuesChange={editor.setRateValues}
				/>

				{editor.rates.map((row, index) => (
					<CreditDimensionRateRow
						key={row.value}
						property={editor.property}
						row={row}
						onChange={(next) => editor.setRate(index, next)}
					/>
				))}

				{editor.rates.length > 0 && (
					<div className="flex items-center gap-2 text-xs text-tertiary-foreground">
						<span className="w-32 shrink-0">anything else</span>
						<span>costs {baseRate}</span>
					</div>
				)}
			</div>

			{editor.showAdjustments ? (
				<div className="flex flex-col gap-2">
					<PropertyValuesLine
						ariaLabel="Adjustment"
						property={editor.adjustProperty}
						propertyPlaceholder="eg. lifecycle"
						values={editor.adjustments.map((row) => row.value)}
						onPropertyChange={editor.setAdjustProperty}
						onValuesChange={editor.setAdjustmentValues}
					/>

					{editor.adjustments.map((row, index) => (
						<CreditAdjustmentRow
							key={row.value}
							property={editor.adjustProperty}
							row={row}
							onChange={(next) => editor.setAdjustment(index, next)}
						/>
					))}
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
