/**
 * S2b contract: `customerFilterMatchesFullCustomer` honours `has_paid`.
 *
 *   - `has_paid: b` matches iff the caller-supplied `hasPaid` equals `b`.
 *   - `$and` / `$or` branches see the same `hasPaid`.
 *   - A filter using `has_paid` (at any depth) without `hasPaid` throws.
 *   - `customerFilterUsesHasPaid` finds `has_paid` through `$and` / `$or`.
 */

import { describe, expect, test } from "bun:test";
import {
	customerFilterMatchesFullCustomer,
	customerFilterUsesHasPaid,
} from "@autumn/shared/api/customers/utils/match/index.js";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { type CustomerName, customers } from "./matcherFixtures";

const CASES: {
	name: string;
	filter: CustomerFilter;
	customer: CustomerName;
	hasPaid: boolean;
	matches: boolean;
}[] = [
	{
		name: "has_paid: true, paid",
		filter: { has_paid: true },
		customer: "paying",
		hasPaid: true,
		matches: true,
	},
	{
		name: "has_paid: true, never paid",
		filter: { has_paid: true },
		customer: "paying",
		hasPaid: false,
		matches: false,
	},
	{
		name: "has_paid: false, paid",
		filter: { has_paid: false },
		customer: "downgraded",
		hasPaid: true,
		matches: false,
	},
	{
		name: "has_paid: false, never paid",
		filter: { has_paid: false },
		customer: "downgraded",
		hasPaid: false,
		matches: true,
	},
	{
		name: "$or: plan branch matches without paying",
		filter: {
			$or: [{ has_paid: true }, { plan: { $some: { plan_id: "pro" } } }],
		},
		customer: "paying",
		hasPaid: false,
		matches: true,
	},
	{
		name: "$or: has_paid branch matches off-plan",
		filter: {
			$or: [{ has_paid: true }, { plan: { $some: { plan_id: "pro" } } }],
		},
		customer: "downgraded",
		hasPaid: true,
		matches: true,
	},
	{
		name: "$or: neither branch",
		filter: {
			$or: [{ has_paid: true }, { plan: { $some: { plan_id: "pro" } } }],
		},
		customer: "downgraded",
		hasPaid: false,
		matches: false,
	},
	{
		name: "$and passes hasPaid through",
		filter: { $and: [{ plan: { plan_id: "free" } }, { has_paid: false }] },
		customer: "downgraded",
		hasPaid: true,
		matches: false,
	},
];

describe("customerFilterMatchesFullCustomer: has_paid", () => {
	test.each(CASES)("$name", ({ filter, customer, hasPaid, matches }) => {
		expect(
			customerFilterMatchesFullCustomer({
				filter,
				fullCustomer: customers[customer],
				hasPaid,
			}),
		).toBe(matches);
	});

	test.each<CustomerFilter>([
		{ has_paid: false },
		{ customer_id: "someone-else", has_paid: true },
		{ $or: [{ plan: { plan_id: "pro" } }, { $and: [{ has_paid: true }] }] },
	])("throws without hasPaid: %j", (filter) => {
		expect(() =>
			customerFilterMatchesFullCustomer({
				filter,
				fullCustomer: customers.paying,
			}),
		).toThrow("customerFilterMatchesFullCustomer: has_paid needs hasPaid");
	});
});

describe("customerFilterUsesHasPaid", () => {
	test.each<{ name: string; filter: CustomerFilter; uses: boolean }>([
		{ name: "empty", filter: {}, uses: false },
		{ name: "plan only", filter: { plan: { plan_id: "pro" } }, uses: false },
		{ name: "top-level", filter: { has_paid: false }, uses: true },
		{
			name: "$and without it",
			filter: { $and: [{ plan: { plan_id: "pro" } }] },
			uses: false,
		},
		{
			name: "$and inside $or",
			filter: { $or: [{ customer_id: "a" }, { $and: [{ has_paid: true }] }] },
			uses: true,
		},
		{
			name: "$or inside $and",
			filter: { $and: [{ $or: [{ has_paid: false }] }] },
			uses: true,
		},
	])("$name → $uses", ({ filter, uses }) => {
		expect(customerFilterUsesHasPaid({ filter })).toBe(uses);
	});
});
