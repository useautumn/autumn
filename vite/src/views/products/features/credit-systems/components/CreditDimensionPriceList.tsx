import type { CreditSchemaItem } from "@autumn/shared";
import { ValueChipInput } from "@/components/v2/rule-builder/ValueChipInput";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Dimensions are typed in at the top; the rate table beneath has a column per dimension. */
export function CreditDimensionPriceList({
	item,
	onChange,
}: CreditDimensionPriceListProps) {
	const editor = useCreditDimensionEditor({ item, onChange });
	const baseRate =
		item.tier_behavior === "graduated"
			? "tiered"
			: String(item.credit_amount ?? 0);

	return (
		<div className="flex flex-col gap-3">
			<ValueChipInput
				aria-label="Dimension fields"
				values={editor.fields}
				onAdd={editor.addField}
				onRemove={editor.removeField}
				placeholder="Add a dimension, eg. region"
			/>

			{editor.fields.length > 0 && (
				<CreditDimensionRateTable
					fields={editor.fields}
					rules={editor.rules}
					baseRate={baseRate}
					onRuleChange={editor.setRule}
					onRuleRemove={editor.removeRule}
					onRuleAdd={editor.addRule}
				/>
			)}
		</div>
	);
}
