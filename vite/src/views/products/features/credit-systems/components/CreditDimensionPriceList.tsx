import type { CreditSchemaItem } from "@autumn/shared";
import { ValuePicker } from "@/components/v2/rule-builder/ValuePicker";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Dimensions are picked at the top; the rate table beneath has a column per dimension. */
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
			<ValuePicker
				suggestions={editor.fields.map((field) => ({
					value: field,
					label: field,
				}))}
				selectedValues={editor.fields}
				onToggle={editor.toggleField}
				onRemove={editor.removeField}
				onAdd={editor.addField}
				placeholder="Add a dimension, eg. region"
				searchPlaceholder="Type a dimension..."
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
