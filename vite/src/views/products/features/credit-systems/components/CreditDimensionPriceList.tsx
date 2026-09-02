import type { CreditSchemaItem } from "@autumn/shared";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditDimensionFields } from "./CreditDimensionFields";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Fields and their values are defined at the top; the rate table beneath has a column per field. */
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
			<CreditDimensionFields
				values={editor.values}
				onAddField={editor.addField}
				onRemoveField={editor.removeField}
				onAddValue={editor.addValue}
				onRemoveValue={editor.removeValue}
			/>

			{editor.fields.length > 0 && (
				<CreditDimensionRateTable
					values={editor.values}
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
