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

/**
 * Edits one rate-card row's dimensions as a price list keyed by a property,
 * plus an optional adjustment list. The property lives in local draft state
 * until the first row exists; after that the rules carry it.
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

	const commitRates = (rows: CreditPriceListRow[]) =>
		onChange(withPriceList({ item, list: { property, rows } }));
	const commitAdjustments = (rows: CreditAdjustmentRow[]) =>
		onChange(
			withAdjustmentList({ item, list: { property: adjustProperty, rows } }),
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
				onChange(
					withPriceList({ item, list: { property: next, rows: rates.rows } }),
				);
			}
		},
		addRate: () => commitRates([...rates.rows, createRateRow()]),
		setRate: (index: number, row: CreditPriceListRow) =>
			commitRates(rates.rows.map((r, i) => (i === index ? row : r))),
		removeRate: (index: number) =>
			commitRates(rates.rows.filter((_, i) => i !== index)),

		showAdjustmentList: () =>
			setDraft((current) => ({ ...current, showAdjustments: true })),
		setAdjustProperty: (next: string) => {
			setDraft((current) => ({ ...current, adjustProperty: next }));
			if (adjustments.rows.length > 0) {
				onChange(
					withAdjustmentList({
						item,
						list: { property: next, rows: adjustments.rows },
					}),
				);
			}
		},
		addAdjustment: () =>
			commitAdjustments([...adjustments.rows, createAdjustmentRow()]),
		setAdjustment: (index: number, row: CreditAdjustmentRow) =>
			commitAdjustments(
				adjustments.rows.map((r, i) => (i === index ? row : r)),
			),
		removeAdjustment: (index: number) => {
			const rows = adjustments.rows.filter((_, i) => i !== index);
			commitAdjustments(rows);
			if (rows.length === 0) {
				setDraft((current) => ({ ...current, showAdjustments: false }));
			}
		},
	};
}
