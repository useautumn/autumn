/**
 * Rate-card list mechanics behind useCreditSchemaList.
 *
 * Red (current):  removing the only row is intercepted by a toast, and a row
 *                 whose feature is picked stays collapsed until clicked again.
 * Green (after):  removing the only row yields an empty card, and picking a
 *                 feature expands that row straight away.
 */

import { expect, test } from "bun:test";
import type { CreditSchemaItem } from "@autumn/shared";
import {
	expandedKeyAfterItemChange,
	keysForSchema,
	removeSchemaItemAt,
} from "./creditSchemaList";

const blankRow: CreditSchemaItem = {
	metered_feature_id: "",
	feature_amount: 1,
	credit_amount: 0,
};
const tokensRow: CreditSchemaItem = {
	metered_feature_id: "tokens",
	feature_amount: 1,
	credit_amount: 2,
};

test("keys grow with the schema and keep the keys already handed out", () => {
	const keys = keysForSchema({ keys: ["a"], length: 3 });

	expect(keys).toHaveLength(3);
	expect(keys[0]).toBe("a");
	expect(new Set(keys).size).toBe(3);
});

test("keys shrink from the end when rows are removed", () => {
	expect(keysForSchema({ keys: ["a", "b", "c"], length: 1 })).toEqual(["a"]);
});

test("removing the only row leaves an empty rate card", () => {
	expect(
		removeSchemaItemAt({ schema: [tokensRow], keys: ["a"], index: 0 }),
	).toEqual({ schema: [], keys: [] });
});

test("removing a middle row drops its key with it", () => {
	expect(
		removeSchemaItemAt({
			schema: [blankRow, tokensRow, blankRow],
			keys: ["a", "b", "c"],
			index: 1,
		}),
	).toEqual({ schema: [blankRow, blankRow], keys: ["a", "c"] });
});

test("picking a feature for a blank row expands that row", () => {
	expect(
		expandedKeyAfterItemChange({
			previous: blankRow,
			next: tokensRow,
			rowKey: "row-1",
			current: null,
		}),
	).toBe("row-1");
});

test("editing a row that already has a feature keeps the current expansion", () => {
	expect(
		expandedKeyAfterItemChange({
			previous: tokensRow,
			next: { ...tokensRow, credit_amount: 5 },
			rowKey: "row-1",
			current: "row-2",
		}),
	).toBe("row-2");
});

test("clearing a row's feature keeps the current expansion", () => {
	expect(
		expandedKeyAfterItemChange({
			previous: tokensRow,
			next: blankRow,
			rowKey: "row-1",
			current: null,
		}),
	).toBeNull();
});
