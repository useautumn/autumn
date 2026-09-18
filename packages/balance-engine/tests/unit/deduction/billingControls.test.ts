import { describe, expect, test } from "bun:test";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import {
	balancesAfter,
	createDeductionRequest,
	customerWith,
	deductFrom,
} from "./deductionFixtures.js";

describe("billing controls", () => {
	test.concurrent(
		"a customer overage_allowed control lets a plain grant run over",
		() => {
			const outcome = deductFrom({
				customer: customerWith({
					overage_allowed: [{ feature_id: "messages", enabled: true }],
				}),
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				value: 15,
			});

			expect(outcome).toMatchObject({ appliedValue: 15, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: -5 }],
			]);
		},
	);

	test.concurrent("a plan overage_allowed:false vetoes native overage", () => {
		const state = createSubjectState({
			identity,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [
				{ ...createCustomerEntitlement({ balance: 10 }), usage_allowed: true },
			],
		});
		const catalog = createCatalogFor({ state });
		for (const product of Object.values(catalog.products)) {
			product.overage_allowed = [{ feature_id: "messages", enabled: false }];
		}
		const outcome = deduct({
			fullSubject: subjectStateToFullSubject({ state, catalog }),
			request: createDeductionRequest({
				org,
				overageBehavior: "cap",
				value: 15,
			}),
		});

		expect(outcome).toMatchObject({ appliedValue: 10, remaining: 5 });
	});

	test.concurrent(
		"a spend limit caps the feature's total overage across its rows",
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
				{
					...createCustomerEntitlement({ id: "b", balance: -3 }),
					usage_allowed: true,
					created_at: occurredAt + 1,
				},
			];

			// b already carries 3 of the 5 allowed overage, so only 2 more may go negative.
			const outcome = deductFrom({
				customer,
				customerEntitlements: rows,
				value: 30,
			});
			expect(outcome).toMatchObject({ appliedValue: 12, remaining: 18 });
			expect(balancesAfter(outcome)).toEqual([["a", { balance: -2 }]]);

			// Under reject the whole value is refused once the cap binds.
			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 30,
					overageBehavior: "reject",
				}),
			).toMatchObject({ rejected: true, changes: [] });
		},
	);

	test.concurrent(
		"a percentage spend limit resolves against the main plans' grant",
		() => {
			const outcome = deductFrom({
				customer: customerWith({
					spend_limits: [
						{
							feature_id: "messages",
							enabled: true,
							limit_type: "usage_percentage",
							overage_limit: 50,
						},
					],
				}),
				customerEntitlements: [
					{ ...createCustomerEntitlement({ balance: 0 }), usage_allowed: true },
				],
				value: 800,
			});

			// grant 1000 × 50% = 500 of overage
			expect(outcome).toMatchObject({ appliedValue: 500, remaining: 300 });
		},
	);

	test.concurrent(
		"an overage_allowed control does not force overage onto a free row when a sibling already carries it natively",
		() => {
			const outcome = deductFrom({
				customer: customerWith({
					overage_allowed: [{ feature_id: "messages", enabled: true }],
				}),
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "free", balance: 10 }),
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "paid", balance: 0 }),
						usage_allowed: true,
						created_at: occurredAt + 1,
					},
				],
				value: 30,
			});

			expect(balancesAfter(outcome)).toEqual([
				["free", { balance: 0 }],
				["paid", { balance: -20 }],
			]);
		},
	);

	test.concurrent(
		"a percentage spend limit with no main plan grant imposes no cap",
		() => {
			const state = createSubjectState({
				identity,
				customer: customerWith({
					spend_limits: [
						{
							feature_id: "messages",
							enabled: true,
							limit_type: "usage_percentage",
							overage_limit: 50,
						},
					],
				}),
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [
					{ ...createCustomerEntitlement({ balance: 0 }), usage_allowed: true },
				],
			});
			const catalog = createCatalogFor({ state });
			for (const product of Object.values(catalog.products)) {
				product.is_add_on = true;
			}
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({ org, value: 800 }),
			});

			expect(outcome).toMatchObject({ appliedValue: 800, remaining: 0 });
		},
	);

	test.concurrent(
		"spend-limit headroom below one unit takes the fraction under cap and refuses under reject",
		() => {
			const customer = customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 0.4 },
				],
			});
			const rows = [
				{ ...createCustomerEntitlement({ balance: 0 }), usage_allowed: true },
			];

			expect(
				deductFrom({ customer, customerEntitlements: rows, value: 1 }),
			).toMatchObject({ appliedValue: 0.4, remaining: 0.6 });
			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 1,
					overageBehavior: "reject",
				}),
			).toMatchObject({ rejected: true });
		},
	);

	test.concurrent("a spend limit still clamps an overflow track", () => {
		const outcome = deductFrom({
			customer: customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 5 },
				],
			}),
			customerEntitlements: [
				{ ...createCustomerEntitlement({ balance: 0 }), usage_allowed: true },
			],
			value: 10,
			overageBehavior: "overflow",
		});

		expect(outcome).toMatchObject({
			appliedValue: 5,
			remaining: 5,
			rejected: false,
		});
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: -5 }],
		]);
	});
});
