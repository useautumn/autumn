import {
	applyCreditMultipliers,
	type CreditSchemaItem,
	creditMultipliersForMatch,
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
	renameDimensionValuesKey,
	rulesOf,
	withAllowedValues,
	withMultiplierRules,
	withRateCredits,
	withRateMatch,
	withRateRules,
	withRenamedField,
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
export type CreditDimensionEditor = ReturnType<typeof useCreditDimensionEditor>;

export function useCreditDimensionEditor({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	// Seeded from what is saved so a dimension outlives the last rule using it:
	// deleting rates must never delete the dimension they matched on.
	const [draftValues, setDraftValues] = useState<DimensionValues>(() =>
		dimensionValues(item),
	);
	const [draftRows, setDraftRows] = useState<CreditMatch[]>([]);
	// Unnamed dimension rows have no key to live under yet, so they are counted
	// separately until they are named. A row with nothing configured starts with
	// one, since configuring dimensions always begins by naming one.
	const [unnamedFields, setUnnamedFields] = useState(() =>
		Object.keys(dimensionValues(item)).length === 0 ? 1 : 0,
	);

	const values = useMemo(
		() => mergeDimensionValues(draftValues, dimensionValues(item)),
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

	const baseCredits =
		item.tier_behavior === "graduated" ? undefined : item.credit_amount;
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

	/**
	 * What a track matching this row would actually cost: the row's rate after
	 * every multiplier the row pins. With no multiplier applying this is the rate
	 * itself — a blank cell would read as "free".
	 */
	const effectiveCredits = useMemo(
		() =>
			(row: CreditRateRow): string => {
				const rate =
					row.dimension ?? coveringRule({ rules, match: row.match })?.dimension;
				if (rate?.tier_behavior === "graduated") return "tiered";

				const amount = rate?.credit_amount ?? baseCredits;
				if (amount === undefined) return "";

				const applied = creditMultipliersForMatch({
					multipliers: item.multipliers ?? {},
					match: row.match,
				});
				return String(applyCreditMultipliers({ amount, multipliers: applied }));
			},
		[item.multipliers, rules, baseCredits],
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
		effectiveCredits,
		hasMultipliers: Object.keys(item.multipliers ?? {}).length > 0,
		rateWarnings,
		unnamedFields,
		addField: () => setUnnamedFields(unnamedFields + 1),
		renameField: (from: string, to: string) => {
			// A name already in use would merge two dimensions silently.
			if (from === to || to in values) return;
			if (from === "") {
				setUnnamedFields(Math.max(unnamedFields - 1, 0));
				setDraftValues({ ...draftValues, [to]: [] });
				return;
			}
			setDraftValues(renameDimensionValuesKey({ values, from, to }));
			onChange(withRenamedField({ item, from, to }));
		},
		removeUnnamedField: () => setUnnamedFields(Math.max(unnamedFields - 1, 0)),
		removeField: (field: string) => {
			const { [field]: _removed, ...allowed } = values;
			restrictTo(allowed);
		},
		// Functional update: pasting a list calls this repeatedly before a rerender.
		addValue: (field: string, value: string) =>
			setDraftValues((current) => ({
				...current,
				[field]: [...(current[field] ?? []), value],
			})),
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
