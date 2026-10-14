import type { CreditSchemaItem } from "@autumn/shared";
import { useCreditDimensionFields } from "./useCreditDimensionFields";
import { useCreditMultipliers } from "./useCreditMultipliers";
import { useCreditRateRows } from "./useCreditRateRows";

export type CreditDimensionEditor = ReturnType<typeof useCreditDimensionEditor>;

export function useCreditDimensionEditor({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const rates = useCreditRateRows({ item, onChange });
	const fields = useCreditDimensionFields({
		item,
		onChange,
		onRestrictDrafts: rates.restrictDrafts,
		onRenameField: rates.renameOrderField,
	});
	const multipliers = useCreditMultipliers({ item, onChange });

	return {
		...fields,
		...rates,
		...multipliers,
		missingCombinationCount: rates.missingCombinationCountFor(fields.values),
		fillCombinations: () => rates.fillCombinations(fields.values),
	};
}
