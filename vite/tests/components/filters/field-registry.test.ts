/**
 * Field registry contract: each field is `{ path, label, valueInput, operators,
 * toFilter, fromFilter }`; a registry builds rows and converts rows ⇄ filter.
 */
import { describe, expect, test } from "bun:test";
import {
	createFieldRegistry,
	filterToRows,
	rowsToFilter,
} from "@/components/filters/fieldRegistry";
import type { FilterRow } from "@/components/filters/types";

type ToyFilter = {
	customer_id?: string | { $ne: string };
	paid?: boolean;
	amount?: { $lte: number } | { $gte: number };
};

type ToyPath = "customer_id" | "paid" | "amount";
type ToyRow = FilterRow<ToyPath>;

const registry = createFieldRegistry<ToyFilter, ToyPath>({
	defaultPath: "paid",
	fields: [
		{
			path: "customer_id",
			label: "Customer",
			valueInput: "customer",
			operators: [
				{ value: "is", label: "is" },
				{ value: "is_not", label: "is not" },
			],
			toFilter: ({ operator, values }) => {
				if (!values[0]) return null;
				return {
					customer_id: operator === "is" ? values[0] : { $ne: values[0] },
				};
			},
			fromFilter: ({ customer_id }) => {
				if (customer_id === undefined) return null;
				if (typeof customer_id === "string")
					return {
						field: "customer_id",
						operator: "is",
						values: [customer_id],
					};
				return {
					field: "customer_id",
					operator: "is_not",
					values: [customer_id.$ne],
				};
			},
		},
		{
			path: "paid",
			label: "Paid",
			valueInput: "boolean",
			operators: [{ value: "is", label: "is" }],
			toFilter: ({ values }) => ({ paid: values[0] === "true" }),
			fromFilter: ({ paid }) =>
				paid === undefined
					? null
					: { field: "paid", operator: "is", values: [String(paid)] },
		},
		{
			path: "amount",
			label: "Amount",
			valueInput: "text",
			operators: [
				{ value: "lte", label: "≤" },
				{ value: "gte", label: "≥" },
			],
			toFilter: ({ operator, values }) => {
				const amount = Number(values[0]);
				return {
					amount: operator === "lte" ? { $lte: amount } : { $gte: amount },
				};
			},
			fromFilter: ({ amount }) => {
				if (amount === undefined) return null;
				if ("$lte" in amount)
					return {
						field: "amount",
						operator: "lte",
						values: [String(amount.$lte)],
					};
				return {
					field: "amount",
					operator: "gte",
					values: [String(amount.$gte)],
				};
			},
		},
	],
});

describe("field registry builds rows", () => {
	test.each<{ name: string; path: ToyPath; expected: ToyRow }>([
		{
			name: "first operator, no values",
			path: "customer_id",
			expected: { field: "customer_id", operator: "is", values: [] },
		},
		{
			name: "single-operator field",
			path: "paid",
			expected: { field: "paid", operator: "is", values: [] },
		},
	])("createRow: $name", ({ path, expected }) => {
		expect(registry.createRow({ path })).toEqual(expected);
	});

	test.each<{ name: string; used: ToyPath[]; expected: ToyPath }>([
		{
			name: "empty group takes the first field",
			used: [],
			expected: "customer_id",
		},
		{ name: "skips used fields", used: ["customer_id"], expected: "paid" },
		{
			name: "every field used falls back to the default",
			used: ["customer_id", "paid", "amount"],
			expected: "paid",
		},
	])("nextRow: $name", ({ used, expected }) => {
		const rows = used.map((path) => registry.createRow({ path }));
		expect(registry.nextRow({ rows }).field).toBe(expected);
	});

	test("getField looks a field up by path", () => {
		expect(registry.getField("amount").label).toBe("Amount");
	});
});

describe("field registry converts rows ⇄ filter", () => {
	test.each<{ name: string; rows: ToyRow[]; filter: ToyFilter }>([
		{ name: "no rows", rows: [], filter: {} },
		{
			name: "one row",
			rows: [{ field: "customer_id", operator: "is", values: ["cus_1"] }],
			filter: { customer_id: "cus_1" },
		},
		{
			name: "negated operator",
			rows: [{ field: "customer_id", operator: "is_not", values: ["cus_1"] }],
			filter: { customer_id: { $ne: "cus_1" } },
		},
		{
			name: "rows AND together in registry order",
			rows: [
				{ field: "customer_id", operator: "is", values: ["cus_1"] },
				{ field: "paid", operator: "is", values: ["false"] },
				{ field: "amount", operator: "gte", values: ["50"] },
			],
			filter: { customer_id: "cus_1", paid: false, amount: { $gte: 50 } },
		},
	])("round trip: $name", ({ rows, filter }) => {
		expect(rowsToFilter({ registry, rows })).toEqual(filter);
		expect(filterToRows({ registry, filter })).toEqual(rows);
	});

	test("rows without a value are dropped from the filter", () => {
		const rows: ToyRow[] = [
			{ field: "customer_id", operator: "is", values: [] },
			{ field: "amount", operator: "lte", values: ["10"] },
		];
		expect(rowsToFilter({ registry, rows })).toEqual({ amount: { $lte: 10 } });
	});
});
