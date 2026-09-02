import type { CreditSchemaItem } from "@autumn/shared";
import { useMemo, useState } from "react";
import {
	type CreditRateRule,
	createRateRule,
	type DimensionValues,
	dimensionValues,
	mergeDimensionValues,
	rateRules,
	withAllowedValues,
	withRateRules,
} from "../utils/creditDimensionUtils";

const without = (values: string[], value: string) =>
	values.filter((current) => current !== value);

/**
 * Fields and values are whatever the rules reference; ones added before any
 * rule uses them live in local state until then, so they survive re-renders.
 */
export function useCreditDimensionEditor({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [draft, setDraft] = useState<DimensionValues>({});
	const values = useMemo(
		() => mergeDimensionValues(dimensionValues(item), draft),
		[item.dimensions, item.multipliers, draft],
	);
	const fields = Object.keys(values);
	const rules = useMemo(() => rateRules(item), [item.dimensions]);

	const commitRules = (next: CreditRateRule[]) =>
		onChange(withRateRules({ item, rules: next }));

	const restrictTo = (allowed: DimensionValues) => {
		setDraft(allowed);
		onChange(withAllowedValues({ item, allowed }));
	};

	return {
		fields,
		values,
		rules,
		addField: (field: string) =>
			setDraft({ ...draft, [field]: draft[field] ?? [] }),
		removeField: (field: string) => {
			const { [field]: _removed, ...allowed } = values;
			restrictTo(allowed);
		},
		addValue: (field: string, value: string) =>
			setDraft({ ...draft, [field]: [...(draft[field] ?? []), value] }),
		removeValue: (field: string, value: string) =>
			restrictTo({ ...values, [field]: without(values[field], value) }),
		addRule: () => commitRules([...rules, createRateRule()]),
		setRule: (index: number, rule: CreditRateRule) =>
			commitRules(rules.map((r, i) => (i === index ? rule : r))),
		removeRule: (index: number) =>
			commitRules(rules.filter((_, i) => i !== index)),
	};
}
