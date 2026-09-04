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
	draftsOf,
	filledRateRows,
	missingCombinationCount,
	nameRateRows,
	rateRowsOf,
	rateRules,
	rulesOf,
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

/**
 * The rates table. A row is a draft until a cost is typed: it shows the cost it
 * would inherit as a placeholder and becomes a saved rule on the first keystroke.
 */
export function useCreditRateRows({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [drafts, setDrafts] = useState<CreditRateDraft[]>([]);
	// A draft that gains a cost is reborn as a saved rule, so its key is carried
	// over by name — otherwise the row remounts on the first keystroke and the
	// cell being typed into loses focus.
	const keysByRuleName = useRef(new Map<string, string>());

	const rules = useMemo(() => rateRules(item), [item.dimensions]);
	const rows = useMemo(
		() => rateRowsOf({ rules, drafts, keysByRuleName: keysByRuleName.current }),
		[rules, drafts],
	);

	const baseRate = item.tier_behavior === "graduated" ? undefined : item;

	/** The rule that would price this match at runtime, else the item's own rate. */
	const rateFor = (match: CreditMatch) =>
		coveringRule({ rules, match })?.dimension ?? baseRate;

	const inheritedCredits = (match: CreditMatch): string =>
		String(asCredits(rateFor(match)) ?? "");

	/**
	 * What a track matching this row would actually cost: its rate after every
	 * multiplier the row pins. With none applying this is the rate itself — a
	 * blank cell would read as "free".
	 */
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

	/** Pairs that could both win one event are rejected at save, so flag both rows. */
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
		// Names are derived from the match, so claim each row's key under the name
		// it will be saved as before the item is rebuilt from it.
		for (const { key, name, dimension } of nameRateRows(next)) {
			if (dimension) keysByRuleName.current.set(name, key);
		}
		setDrafts(draftsOf(next));
		onChange(withRateRules({ item, rules: rulesOf(next) }));
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
		addRow: () => setDrafts([...drafts, createRateDraft()]),
		setRowMatch: (index: number, match: CreditMatch) =>
			setRows(
				replaceAt(rows, index, withRateMatch({ row: rows[index], match })),
			),
		// Shown when a row carries one, or when a clash needs one to resolve it.
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
