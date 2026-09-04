import type { CreditSchemaItem } from "@autumn/shared";
import { useCreditDimensionFields } from "./useCreditDimensionFields";
import { useCreditMultipliers } from "./useCreditMultipliers";
import { useCreditRateRows } from "./useCreditRateRows";

export type CreditDimensionEditor = ReturnType<typeof useCreditDimensionEditor>;

/**
 * One rate-card row's dimension config, as three tables edit it: the dimensions
 * and their values, the rates keyed on those values, and the multipliers that
 * scale them. Dropping a dimension or value cascades into the rate drafts, which
 * is the only coupling between them.
 */
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
