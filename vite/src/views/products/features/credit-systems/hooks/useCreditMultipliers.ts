import type { CreditSchemaItem } from "@autumn/shared";
import { useMemo } from "react";
import {
	type CreditMultiplierRule,
	createMultiplierRule,
	multiplierRules,
	withMultiplierRules,
} from "../utils/creditDimensionUtils";
import { removeAt, replaceAt } from "../utils/listUtils";

/** Multipliers have no draft state: they are saved as typed, so names stay unique. */
export function useCreditMultipliers({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const multipliers = useMemo(() => multiplierRules(item), [item.multipliers]);

	const commit = (next: CreditMultiplierRule[]) =>
		onChange(withMultiplierRules({ item, rules: next }));

	return {
		multipliers,
		hasMultipliers: multipliers.length > 0,
		addMultiplier: () => commit([...multipliers, createMultiplierRule()]),
		setMultiplier: (index: number, rule: CreditMultiplierRule) =>
			commit(replaceAt(multipliers, index, rule)),
		removeMultiplier: (index: number) => commit(removeAt(multipliers, index)),
	};
}
