import type { CreditSchemaItem } from "@autumn/shared";
import { useState } from "react";
import {
	type CreditAdjustmentList,
	type CreditAdjustmentRow,
	type CreditPriceList,
	type CreditPriceListRow,
	createAdjustmentRow,
	createRateRow,
	isApiAuthored,
	toAdjustmentList,
	toPriceList,
	withAdjustmentList,
	withPriceList,
} from "../utils/creditDimensionUtils";

type Draft = {
	property: string;
	adjustProperty: string;
	showAdjustments: boolean;
};

const draftFrom = (item: CreditSchemaItem): Draft => {
	const rates = toPriceList(item);
	const adjustments = toAdjustmentList(item);
	return {
		property: rates?.property ?? "",
		adjustProperty: adjustments?.property ?? "",
		showAdjustments: (adjustments?.rows.length ?? 0) > 0,
	};
};

const rowsForValues = <T extends { value: string }>({
	values,
	rows,
	create,
}: {
	values: string[];
	rows: T[];
	create: (value: string) => T;
}): T[] =>
	values.map(
		(value) => rows.find((row) => row.value === value) ?? create(value),
	);

/**
 * Edits one rate-card row's dimensions as a price list keyed by a property,
 * plus an optional adjustment list. The property lives in local draft state
 * until the first value exists; after that the rules carry it.
 */
export function useCreditDimensionEditor({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [draft, setDraft] = useState<Draft>(() => draftFrom(item));

	const readOnly = isApiAuthored(item);
	const rates: CreditPriceList = toPriceList(item) ?? {
		property: "",
		rows: [],
	};
	const adjustments: CreditAdjustmentList = toAdjustmentList(item) ?? {
		property: "",
		rows: [],
	};

	const property = rates.rows.length > 0 ? rates.property : draft.property;
	const adjustProperty =
		adjustments.rows.length > 0 ? adjustments.property : draft.adjustProperty;

	const commitRates = ({
		rows,
		nextProperty = property,
	}: {
		rows: CreditPriceListRow[];
		nextProperty?: string;
	}) =>
		onChange(withPriceList({ item, list: { property: nextProperty, rows } }));

	const commitAdjustments = ({
		rows,
		nextProperty = adjustProperty,
	}: {
		rows: CreditAdjustmentRow[];
		nextProperty?: string;
	}) =>
		onChange(
			withAdjustmentList({ item, list: { property: nextProperty, rows } }),
		);

	return {
		readOnly,
		property,
		rates: rates.rows,
		adjustProperty,
		adjustments: adjustments.rows,
		showAdjustments: draft.showAdjustments || adjustments.rows.length > 0,

		setProperty: (next: string) => {
			setDraft((current) => ({ ...current, property: next }));
			if (rates.rows.length > 0) {
				commitRates({ rows: rates.rows, nextProperty: next });
			}
		},
		setRateValues: (values: string[]) =>
			commitRates({
				rows: rowsForValues({
					values,
					rows: rates.rows,
					create: createRateRow,
				}),
			}),
		setRate: (index: number, row: CreditPriceListRow) =>
			commitRates({ rows: rates.rows.map((r, i) => (i === index ? row : r)) }),

		showAdjustmentList: () =>
			setDraft((current) => ({ ...current, showAdjustments: true })),
		setAdjustProperty: (next: string) => {
			setDraft((current) => ({ ...current, adjustProperty: next }));
			if (adjustments.rows.length > 0) {
				commitAdjustments({ rows: adjustments.rows, nextProperty: next });
			}
		},
		setAdjustmentValues: (values: string[]) => {
			commitAdjustments({
				rows: rowsForValues({
					values,
					rows: adjustments.rows,
					create: createAdjustmentRow,
				}),
			});
			if (values.length === 0) {
				setDraft((current) => ({ ...current, showAdjustments: false }));
			}
		},
		setAdjustment: (index: number, row: CreditAdjustmentRow) =>
			commitAdjustments({
				rows: adjustments.rows.map((r, i) => (i === index ? row : r)),
			}),
	};
}
