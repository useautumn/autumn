import type { CreditSchemaItem } from "@autumn/shared";
import { useCreditDimensionEditor } from "../hooks/useCreditDimensionEditor";
import { isGraduated } from "../utils/creditSchemaUtils";
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
					base={item}
					onRuleChange={editor.setRule}
					onRuleRemove={editor.removeRule}
					onRuleAdd={editor.addRule}
					onBaseCreditsChange={(credit_amount) =>
						onChange(isGraduated(item) ? item : { ...item, credit_amount })
					}
				/>
			)}
		</div>
	);
}
