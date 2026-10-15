/**
 * S2 follow-up: `customerFilterMatchesFullCustomer` honours `$and` / `$or`.
 * Each branch is its own CustomerFilter; `$and` needs every branch, `$or`
 * any, and sibling fields stay ANDed with the group, as in
 * `parseCustomerFilter`.
 *
 * Red (before):  `$and` / `$or` are ignored, so e.g. an `$or`-only filter
 *                matches every customer.
 * Green (after): each row matches exactly its expected customers, and the
 *                SQL compiler composes the same branches the same way.
 */

import { describe, expect, test } from "bun:test";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { type CustomerName, matchingCustomers } from "./matcherFixtures";
import { compileCustomerFilter, normalizeSql } from "./planFilterCases";

const ROOT_AMBIENT = "c.org_id = ? AND c.env = ? AND ";

/** The branch's own predicate, without the root org/env ambient. */
const compileBranchBody = ({ filter }: { filter: CustomerFilter }) =>
	normalizeSql(compileCustomerFilter({ filter }).sql).replace(ROOT_AMBIENT, "");

const CASES: {
	name: string;
	filter: CustomerFilter;
	matches: CustomerName[];
}[] = [
	{
		name: "$or of one non-matching branch matches nobody",
		filter: { $or: [{ plan: { plan_id: "missing" } }] },
		matches: [],
	},
	{
		name: "$or: any branch",
		filter: {
			$or: [{ plan: { plan_id: "free" } }, { item: { feature_id: "credits" } }],
		},
		matches: ["paying", "downgraded"],
	},
	{
		name: "$or mixing customer_id and plan",
		filter: {
			$or: [{ customer_id: "noPlan" }, { plan: { plan_id: "unlimited" } }],
		},
		matches: ["unlimited", "noPlan"],
	},
	{
		name: "$and: every branch (credits only on the expired plan)",
		filter: {
			$and: [
				{ plan: { plan_id: "free" } },
				{ item: { feature_id: "credits" } },
			],
		},
		matches: [],
	},
	{
		name: "$and: every branch, each its own plan check",
		filter: {
			$and: [
				{ plan: { plan_id: "free" } },
				{ item: { feature_id: "messages" } },
			],
		},
		matches: ["downgraded"],
	},
	{
		name: "sibling field ANDs with the $or group",
		filter: {
			customer_id: { $in: ["paying", "downgraded"] },
			$or: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "unlimited" } }],
		},
		matches: ["downgraded"],
	},
	{
		name: "$and nested inside $or",
		filter: {
			$or: [
				{
					$and: [
						{ plan: { plan_id: "pro" } },
						{ item: { rollover: { $ne: null } } },
					],
				},
				{ customer_id: "noPlan" },
			],
		},
		matches: ["paying", "noPlan"],
	},
];

describe("customerFilterMatchesFullCustomer: $and / $or", () => {
	test.each(CASES)("$name", ({ filter, matches }) => {
		expect(matchingCustomers({ filter })).toEqual(matches);
	});

	test("SQL: $or joins each branch's predicate with OR", () => {
		const branches: CustomerFilter[] = [
			{ plan: { plan_id: "free" } },
			{ item: { feature_id: "credits" } },
		];
		const sql = normalizeSql(
			compileCustomerFilter({ filter: { $or: branches } }).sql,
		);
		const [first, second] = branches.map((filter) =>
			compileBranchBody({ filter }),
		);

		expect(sql).toBe(`${ROOT_AMBIENT}(${first} OR ${second})`);
	});

	test("SQL: $and of branches ≡ the same fields as siblings", () => {
		const viaAnd = compileCustomerFilter({
			filter: {
				$and: [
					{ plan: { plan_id: "free" } },
					{ item: { feature_id: "messages" } },
				],
			},
		});
		const viaSiblings = compileCustomerFilter({
			filter: { plan: { plan_id: "free" }, item: { feature_id: "messages" } },
		});

		expect(viaAnd).toEqual(viaSiblings);
	});
});
