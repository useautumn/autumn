import {
	applyCreditMultipliers,
	type CreditSchemaItem,
	creditMultipliersForMatch,
	findAmbiguousCreditDimensions,
	formatCreditMatch,
} from "@autumn/shared";
import { useMemo, useRef, useState } from "react";
import {
	type CreditMatch,
	type CreditRateDraft,
	type CreditRateRow,
	coveringRule,
	createRateDraft,
	type DimensionValues,
	draftsFrom,
	filledRateRows,
	missingCombinationCount,
	nameRateRows,
	rateRules,
	renamedRowOrder,
	savedRulesFrom,
	toRateRows,
	withRateCredits,
	withRateMatch,
	withRatePriority,
	withRateRules,
} from "../utils/creditDimensionUtils";
import { removeAt, replaceAt } from "../utils/listUtils";

const asCredits = (rate?: {
	tier_behavior?: string;
	credit_amount?: number;
}) => (rate?.tier_behavior === "graduated" ? "tiered" : rate?.credit_amount);

export function useCreditRateRows({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [drafts, setDrafts] = useState<CreditRateDraft[]>([]);
	const keysByRuleName = useRef(new Map<string, string>());
	const [rowOrder, setRowOrder] = useState<string[]>([]);

	const rules = useMemo(() => rateRules(item), [item.dimensions]);
	const rows = useMemo(
		() =>
			toRateRows({
				rules,
				drafts,
				keysByRuleName: keysByRuleName.current,
				order: rowOrder,
			}),
		[rules, drafts, rowOrder],
	);

	const baseRate = item.tier_behavior === "graduated" ? undefined : item;

	const rateFor = (match: CreditMatch) =>
		coveringRule({ rules, match })?.dimension ?? baseRate;

	const inheritedCredits = (match: CreditMatch): string =>
		String(asCredits(rateFor(match)) ?? "");

	const effectiveCredits = (row: CreditRateRow): string => {
		const rate = row.dimension ?? rateFor(row.match);
		if (rate?.tier_behavior === "graduated") return "tiered";

		const amount = rate?.credit_amount;
		if (amount === undefined) return "";

		return String(
			applyCreditMultipliers({
				amount,
				multipliers: creditMultipliersForMatch({
					multipliers: item.multipliers ?? {},
					match: row.match,
				}),
			}),
		);
	};

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

	const setRows = (next: CreditRateRow[]) => {
		for (const { key, name, dimension } of nameRateRows(next)) {
			if (dimension) keysByRuleName.current.set(name, key);
		}
		setRowOrder(next.map((row) => row.key));
		setDrafts(draftsFrom(next));
		onChange(withRateRules({ item, rules: savedRulesFrom(next) }));
	};

	return {
		rows,
		rateWarnings,
		inheritedCredits,
		effectiveCredits,
		missingCombinationCountFor: (values: DimensionValues) =>
			missingCombinationCount({ values, rows }),
		restrictDrafts: (isAllowed: (draft: CreditRateDraft) => boolean) =>
			setDrafts((current) => current.filter(isAllowed)),
		renameOrderField: ({ from, to }: { from: string; to: string }) =>
			setRowOrder((current) =>
				renamedRowOrder({ order: current, item, from, to }),
			),
		addRow: () => {
			const draft = createRateDraft();
			setRowOrder([...rows.map((row) => row.key), draft.key]);
			setDrafts([...drafts, draft]);
		},
		setRowMatch: (index: number, match: CreditMatch) =>
			setRows(
				replaceAt(rows, index, withRateMatch({ row: rows[index], match })),
			),
		showPriority:
			rateWarnings.size > 0 ||
			rows.some((row) => row.dimension?.priority !== undefined),
		setRowPriority: (index: number, priority: number | undefined) =>
			setRows(
				replaceAt(
					rows,
					index,
					withRatePriority({ row: rows[index], priority }),
				),
			),
		setRowCredits: (index: number, credits: number | undefined) =>
			setRows(
				replaceAt(rows, index, withRateCredits({ row: rows[index], credits })),
			),
		removeRow: (index: number) => setRows(removeAt(rows, index)),
		fillCombinations: (values: DimensionValues) =>
			setRows(filledRateRows({ values, rows })),
	};
}
