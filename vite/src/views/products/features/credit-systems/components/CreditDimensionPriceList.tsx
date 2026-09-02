import type { CreditSchemaItem } from "@autumn/shared";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { CreditDimensionFieldTable } from "./CreditDimensionFieldTable";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Two tables: the dimensions and their values, then the rates with a column per dimension. */
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
			<CreditDimensionFieldTable
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
