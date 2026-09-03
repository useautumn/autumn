import {
	type CreditSchemaItem,
	findAmbiguousCreditDimensions,
	formatCreditMatch,
} from "@autumn/shared";
import { useMemo, useState } from "react";
import {
	type CreditMatch,
	type CreditMultiplierRule,
	type CreditRateRow,
	coveringRule,
	createMultiplierRule,
	type DimensionValues,
	dimensionValues,
	draftsOf,
	filledRateRows,
	isMatchAllowed,
	mergeDimensionValues,
	missingCombinationCount,
	multiplierRules,
	rateRowsOf,
	rateRules,
	rulesOf,
	withAllowedValues,
	withMultiplierRules,
	withRateCredits,
	withRateMatch,
	withRateRules,
} from "../utils/creditDimensionUtils";

const without = (values: string[], value: string) =>
	values.filter((current) => current !== value);

const replaceAt = <T>(list: T[], index: number, next: T) =>
	list.map((current, i) => (i === index ? next : current));

const removeAt = <T>(list: T[], index: number) =>
	list.filter((_, i) => i !== index);

/**
 * Fields, values and rate rows exist in local state until a saved rule uses
 * them: a draft row has a match but no cost, shows what it would inherit, and
 * becomes a rule the moment a cost is typed.
 */
export function useCreditDimensionEditor({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [draftValues, setDraftValues] = useState<DimensionValues>({});
	const [draftRows, setDraftRows] = useState<CreditMatch[]>([]);

	const values = useMemo(
		() => mergeDimensionValues(dimensionValues(item), draftValues),
		[item.dimensions, item.multipliers, draftValues],
	);
	const fields = Object.keys(values);
	const rules = useMemo(() => rateRules(item), [item.dimensions]);
	const rows = useMemo(
		() => rateRowsOf({ rules, drafts: draftRows }),
		[rules, draftRows],
	);
	const multipliers = useMemo(() => multiplierRules(item), [item.multipliers]);
	const rateWarnings = useMemo(() => {
		const warnings = new Map<string, string>();
		for (const { names, example } of findAmbiguousCreditDimensions(
			item.dimensions ?? {},
		)) {
			const warning = `Both this row and another match ${formatCreditMatch(example)}. Add a value to one of them before saving.`;
			for (const name of names) warnings.set(name, warning);
		}
		return warnings;
	}, [item.dimensions]);

	const fallbackCredits =
		item.tier_behavior === "graduated" ? "tiered" : String(item.credit_amount);
	const inheritedCredits = useMemo(
		() =>
			(match: CreditMatch): string => {
				const rule = coveringRule({ rules, match });
				if (!rule) return fallbackCredits;
				return rule.dimension.tier_behavior === "graduated"
					? "tiered"
					: String(rule.dimension.credit_amount);
			},
		[rules, fallbackCredits],
	);

	const setRows = (next: CreditRateRow[]) => {
		setDraftRows(draftsOf(next));
		onChange(withRateRules({ item, rules: rulesOf(next) }));
	};
	const commitMultipliers = (next: CreditMultiplierRule[]) =>
		onChange(withMultiplierRules({ item, rules: next }));

	const restrictTo = (allowed: DimensionValues) => {
		setDraftValues(allowed);
		setDraftRows(draftRows.filter((match) => isMatchAllowed(match, allowed)));
		onChange(withAllowedValues({ item, allowed }));
	};

	return {
		fields,
		values,
		rows,
		multipliers,
		inheritedCredits,
		rateWarnings,
		addField: (field: string) =>
			setDraftValues({ ...draftValues, [field]: draftValues[field] ?? [] }),
		removeField: (field: string) => {
			const { [field]: _removed, ...allowed } = values;
			restrictTo(allowed);
		},
		addValue: (field: string, value: string) =>
			setDraftValues({
				...draftValues,
				[field]: [...(draftValues[field] ?? []), value],
			}),
		removeValue: (field: string, value: string) =>
			restrictTo({ ...values, [field]: without(values[field], value) }),
		addRow: () => setDraftRows([...draftRows, {}]),
		setRowMatch: (index: number, match: CreditMatch) =>
			setRows(
				replaceAt(rows, index, withRateMatch({ row: rows[index], match })),
			),
		setRowCredits: (index: number, credits: number | undefined) =>
			setRows(
				replaceAt(rows, index, withRateCredits({ row: rows[index], credits })),
			),
		removeRow: (index: number) => setRows(removeAt(rows, index)),
		missingCombinationCount: missingCombinationCount({ values, rows }),
		fillCombinations: () => setRows(filledRateRows({ values, rows })),
		addMultiplier: () =>
			commitMultipliers([...multipliers, createMultiplierRule()]),
		setMultiplier: (index: number, rule: CreditMultiplierRule) =>
			commitMultipliers(replaceAt(multipliers, index, rule)),
		removeMultiplier: (index: number) =>
			commitMultipliers(removeAt(multipliers, index)),
	};
}
