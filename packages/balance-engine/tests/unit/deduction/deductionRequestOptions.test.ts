import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { createCustomerEntitlement, occurredAt } from "../engineFixtures.js";
import {
	balancesAfter,
	customerWith,
	deductFrom,
} from "./deductionFixtures.js";

const twoRows = [
	createCustomerEntitlement({ id: "a", balance: 10 }),
	{
		...createCustomerEntitlement({ id: "b", balance: 5 }),
		created_at: occurredAt + 1,
	},
];

describe("overflow for a balance update", () => {
	test.concurrent(
		"drives the first row below zero with no floor, even without usage_allowed",
		() => {
			const outcome = deductFrom({
				customerEntitlements: twoRows,
				value: 45,
				overageBehavior: "overflow",
			});

			expect(outcome).toMatchObject({ appliedValue: 45, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([
				["a", { balance: -30 }],
				["b", { balance: 0 }],
			]);
		},
	);

	test.concurrent("refunds past the grant with no ceiling", () => {
		const outcome = deductFrom({
			customerEntitlements: [
				createCustomerEntitlement({ id: "a", balance: 10 }),
			],
			value: -50,
			overageBehavior: "overflow",
		});

		expect(outcome).toMatchObject({ appliedValue: -50, remaining: 0 });
		expect(balancesAfter(outcome)).toEqual([["a", { balance: 60 }]]);
	});

	test.concurrent(
		"without the spend limit, overage runs past the cap overflow keeps",
		() => {
			const customer = customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 5 },
				],
			});
			const rows = [
				{
					...createCustomerEntitlement({ id: "a", balance: 10 }),
					usage_allowed: true,
				},
			];

			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 30,
					overageBehavior: "overflow",
				}),
			).toMatchObject({ appliedValue: 15, remaining: 15 });
			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 30,
					overageBehavior: "overflow",
					enforcesSpendLimit: false,
				}),
			).toMatchObject({ appliedValue: 30, remaining: 0 });
		},
	);
});

describe("row selection", () => {
	test.concurrent("a balance id narrows the draw to that row", () => {
		const outcome = deductFrom({
			customerEntitlements: [
				twoRows[0],
				{ ...twoRows[1], external_id: "topup" },
			],
			value: 3,
			customerEntitlementFilters: { balanceId: "topup" },
		});

		expect(balancesAfter(outcome)).toEqual([["b", { balance: 2 }]]);
	});

	test.concurrent(
		"a customer entitlement id narrows the draw to that row",
		() => {
			const outcome = deductFrom({
				customerEntitlements: twoRows,
				value: 3,
				customerEntitlementFilters: { cusEntIds: ["b"] },
			});

			expect(balancesAfter(outcome)).toEqual([["b", { balance: 2 }]]);
		},
	);

	test.concurrent("a filter that matches nothing selects no rows", () => {
		const outcome = deductFrom({
			customerEntitlements: twoRows,
			value: 3,
			customerEntitlementFilters: { balanceId: "typo" },
		});

		expect(outcome.context.customerEntitlements).toEqual([]);
		expect(outcome.changes).toEqual([]);
	});
});

describe("usage windows off", () => {
	test.concurrent(
		"a draw that does not count windows neither caps nor counts",
		() => {
			const outcome = deductFrom({
				customer: customerWith({
					usage_limits: [
						{
							feature_id: "messages",
							enabled: true,
							limit: 2,
							interval: ResetInterval.Day,
						},
					],
				}),
				customerEntitlements: [
					createCustomerEntitlement({ id: "a", balance: 10 }),
				],
				value: 5,
				countsUsageWindows: false,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(
				outcome.changes.filter((change) => change.table === "usageWindows"),
			).toEqual([]);
		},
	);
});
