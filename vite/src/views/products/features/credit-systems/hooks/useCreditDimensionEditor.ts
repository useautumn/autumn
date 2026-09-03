import type { CreditSchemaItem } from "@autumn/shared";
import { useMemo, useState } from "react";
import {
	type CreditMultiplierRule,
	type CreditRateRule,
	createMultiplierRule,
	createRateRule,
	type DimensionValues,
	dimensionValues,
	mergeDimensionValues,
	multiplierRules,
	rateRules,
	withAllowedValues,
	withMultiplierRules,
	withRateRules,
} from "../utils/creditDimensionUtils";

const without = (values: string[], value: string) =>
	values.filter((current) => current !== value);

const replaceAt = <T>(list: T[], index: number, next: T) =>
	list.map((current, i) => (i === index ? next : current));

const removeAt = <T>(list: T[], index: number) =>
	list.filter((_, i) => i !== index);

/**
 * Fields and values are whatever the rules reference; ones added before any
 * rule uses them live in local state until then, so they survive re-renders.
 * With no saved rates the table offers one blank row, committed on first edit.
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
	const savedRules = useMemo(() => rateRules(item), [item.dimensions]);
	const rules = useMemo(
		() => (savedRules.length === 0 ? [createRateRule()] : savedRules),
		[savedRules],
	);
	const multipliers = useMemo(() => multiplierRules(item), [item.multipliers]);

	const commitRules = (next: CreditRateRule[]) =>
		onChange(withRateRules({ item, rules: next }));
	const commitMultipliers = (next: CreditMultiplierRule[]) =>
		onChange(withMultiplierRules({ item, rules: next }));

	const restrictTo = (allowed: DimensionValues) => {
		setDraft(allowed);
		onChange(withAllowedValues({ item, allowed }));
	};

	return {
		fields,
		values,
		rules,
		multipliers,
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
			commitRules(replaceAt(rules, index, rule)),
		removeRule: (index: number) => commitRules(removeAt(savedRules, index)),
		addMultiplier: () =>
			commitMultipliers([...multipliers, createMultiplierRule()]),
		setMultiplier: (index: number, rule: CreditMultiplierRule) =>
			commitMultipliers(replaceAt(multipliers, index, rule)),
		removeMultiplier: (index: number) =>
			commitMultipliers(removeAt(multipliers, index)),
	};
}
