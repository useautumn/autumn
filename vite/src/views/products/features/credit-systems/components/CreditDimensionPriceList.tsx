import type { CreditSchemaItem } from "@autumn/shared";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { isGraduated } from "../utils/creditSchemaUtils";
import { CreditDimensionFieldTable } from "./CreditDimensionFieldTable";
import { CreditDimensionMultiplierTable } from "./CreditDimensionMultiplierTable";
import { CreditDimensionRateTable } from "./CreditDimensionRateTable";

interface CreditDimensionPriceListProps {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}

/** Three tables: the dimensions and their values, then rates and multipliers with a column per dimension. */
export function CreditDimensionPriceList({
	item,
	onChange,
}: CreditDimensionPriceListProps) {
	const editor = useCreditDimensionEditor({ item, onChange });
	const baseRate = isGraduated(item)
		? "tiered"
		: `${item.credit_amount ?? 0} credits`;

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
				<>
					<CreditDimensionRateTable
						values={editor.values}
						rules={editor.rules}
						baseRate={baseRate}
						onRuleChange={editor.setRule}
						onRuleRemove={editor.removeRule}
						onRuleAdd={editor.addRule}
					/>
					<CreditDimensionMultiplierTable
						values={editor.values}
						multipliers={editor.multipliers}
						onMultiplierChange={editor.setMultiplier}
						onMultiplierRemove={editor.removeMultiplier}
						onMultiplierAdd={editor.addMultiplier}
					/>
				</>
			)}
		</div>
	);
}
