import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	CusProductStatus,
	PriceType,
} from "@autumn/shared";
import type {
	CommandOrg,
	WorkerCustomerProduct,
} from "../../../src/balanceEngine.js";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import {
	balancesAfter,
	createDeductionRequest,
	deductFrom,
} from "./deductionFixtures.js";

describe("deduct", () => {
	test.concurrent("takes from one row and stops at zero under cap", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			value: 5,
		});

		expect(outcome).toMatchObject({
			appliedValue: 3,
			remaining: 2,
			rejected: false,
		});
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: 0 }],
		]);
	});

	test.concurrent("refuses the whole value under reject", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			value: 5,
			overageBehavior: "reject",
		});

		expect(outcome).toMatchObject({
			appliedValue: 3,
			remaining: 2,
			rejected: true,
			changes: [],
		});
	});

	test.concurrent("drives a row negative under overflow", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			value: 5,
			overageBehavior: "overflow",
		});

		expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: -2 }],
		]);
	});

	test.concurrent("drains rows in order, included before overage", () => {
		const outcome = deductFrom({
			customerEntitlements: [
				{
					...createCustomerEntitlement({ id: "free", balance: 10 }),
					created_at: occurredAt,
				},
				{
					...createCustomerEntitlement({ id: "paid", balance: 5 }),
					created_at: occurredAt + 1,
					usage_allowed: true,
				},
			],
			value: 30,
		});

		expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
		expect(
			outcome.deltas.map((delta) => [delta.id, delta.balanceDelta]),
		).toEqual([
			["free", -10],
			["paid", -5],
			["paid", -15],
		]);
		expect(balancesAfter(outcome)).toEqual([
			["free", { balance: 0 }],
			["paid", { balance: -15 }],
		]);
	});

	test.concurrent(
		"an unlimited row absorbs everything and siblings stay untouched",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "finite", balance: 10 }),
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "infinite", balance: 0 }),
						created_at: occurredAt + 1,
						unlimited: true,
					},
				],
				value: 30,
			});

			expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([["infinite", { balance: -30 }]]);
		},
	);

	test.concurrent(
		"a refund lifts an overdrawn row to zero, then rows in order up to their grant",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "a", balance: -4 }),
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "b", balance: 998 }),
						created_at: occurredAt + 1,
					},
				],
				value: -10,
			});

			expect(outcome).toMatchObject({
				appliedValue: -10,
				remaining: 0,
				rejected: false,
			});
			expect(
				outcome.deltas.map((delta) => [delta.id, delta.balanceDelta]),
			).toEqual([
				["a", 4],
				["a", 6],
			]);
			expect(balancesAfter(outcome)).toEqual([["a", { balance: 6 }]]);
		},
	);

	test.concurrent(
		"a refund stops at the grant plus the row's adjustment",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{ ...createCustomerEntitlement({ balance: 995 }), adjustment: 10 },
				],
				value: -20,
			});

			expect(outcome).toMatchObject({ appliedValue: -15, remaining: -5 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: 1010 }],
			]);
		},
	);

	test.concurrent("overage stops at usage_limit above the grant", () => {
		const state = createSubjectState({
			identity,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [
				{ ...createCustomerEntitlement({ balance: 10 }), usage_allowed: true },
			],
		});
		const catalog = createCatalogFor({ state });
		for (const entitlement of Object.values(catalog.entitlements)) {
			entitlement.usage_limit = 1005;
		}
		const outcome = deduct({
			fullSubject: subjectStateToFullSubject({ state, catalog }),
			request: createDeductionRequest({
				org,
				overageBehavior: "cap",
				value: 20,
			}),
		});

		expect(outcome).toMatchObject({ appliedValue: 15, remaining: 5 });
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: -5 }],
		]);
	});

	test.concurrent(
		"reverse_deduction_order flips which row drains first",
		() => {
			const customerEntitlements = [
				{
					...createCustomerEntitlement({ id: "resetting", balance: 10 }),
					next_reset_at: occurredAt + 1000,
				},
				createCustomerEntitlement({ id: "lifetime", balance: 10 }),
			];
			const drainedFirst = ({ reverse }: { reverse: boolean }) =>
				deductFrom({
					customerEntitlements,
					value: 5,
					orgConfig: { ...org.config, reverse_deduction_order: reverse },
				}).deltas.map((delta) => delta.id);

			expect(drainedFirst({ reverse: false })).toEqual(["resetting"]);
			expect(drainedFirst({ reverse: true })).toEqual(["lifetime"]);
		},
	);

	test.concurrent(
		"past-due products fund a track only when the org says so",
		() => {
			const pastDueProduct: WorkerCustomerProduct = {
				...createCustomerProduct(),
				id: "cp_past_due",
				status: CusProductStatus.PastDue,
			};
			const customerEntitlements = [
				createCustomerEntitlement({ id: "active_row", balance: 10 }),
				{
					...createCustomerEntitlement({ id: "past_due_row", balance: 10 }),
					customer_product_id: "cp_past_due",
				},
			];
			const applied = ({ includePastDue }: { includePastDue: boolean }) =>
				deductFrom({
					customerProducts: [createCustomerProduct(), pastDueProduct],
					customerEntitlements,
					value: 15,
					orgConfig: { ...org.config, include_past_due: includePastDue },
				}).appliedValue;

			expect(applied({ includePastDue: false })).toBe(10);
			expect(applied({ includePastDue: true })).toBe(15);
		},
	);

	test.concurrent(
		"a prepaid grant lifts the refund ceiling by quantity × billing units",
		() => {
			const state = createSubjectState({
				identity,
				customerProducts: [
					{
						...createCustomerProduct(),
						options: [
							{
								feature_id: "messages",
								internal_feature_id: "feat_messages",
								quantity: 3,
							},
						],
					},
				],
				customerPrices: [
					{
						id: "cpr_1",
						internal_customer_id: "cus_internal_1",
						customer_product_id: "cp_1",
						price_id: "price_prepaid",
						created_at: occurredAt,
					},
				],
				customerEntitlements: [createCustomerEntitlement({ balance: 1290 })],
			});
			const catalog = createCatalogFor({ state });
			catalog.prices.price_prepaid = {
				id: "price_prepaid",
				internal_product_id: "prod_internal_pro",
				entitlement_id: "ent_messages_monthly",
				proration_config: null,
				config: {
					type: PriceType.Usage,
					bill_when: BillWhen.InAdvance,
					billing_units: 100,
					internal_feature_id: "feat_messages",
					feature_id: "messages",
					usage_tiers: [],
					interval: BillingInterval.Month,
				},
			};
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({
					org,
					overageBehavior: "cap",
					value: -20,
				}),
			});

			// grant 1000 + 3 × 100 prepaid = 1300 ceiling
			expect(outcome).toMatchObject({ appliedValue: -10, remaining: -10 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: 1300 }],
			]);
		},
	);

	test.concurrent("the product quantity multiplies an unpriced grant", () => {
		const outcome = deductFrom({
			customerProducts: [{ ...createCustomerProduct(), quantity: 2 }],
			customerEntitlements: [createCustomerEntitlement({ balance: 1995 })],
			value: -20,
		});

		expect(outcome).toMatchObject({ appliedValue: -5, remaining: -15 });
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: 2000 }],
		]);
	});

	test.concurrent(
		"a past-due plan funds a track but not a check when the org blocks overdue usage",
		() => {
			const pastDue: WorkerCustomerProduct = {
				...createCustomerProduct(),
				status: CusProductStatus.PastDue,
			};
			const state = createSubjectState({
				identity,
				customerProducts: [pastDue],
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			});
			const blocking: CommandOrg = {
				config: { ...org.config, block_overdue_entitlements: true },
			};
			const run = ({ enforceOverdueBlock }: { enforceOverdueBlock: boolean }) =>
				deduct({
					fullSubject: createSubjectFor({ state }),
					request: createDeductionRequest({
						org: blocking,
						overageBehavior: "cap",
						enforceOverdueBlock,
						value: 5,
					}),
				});

			expect(run({ enforceOverdueBlock: false })).toMatchObject({
				appliedValue: 5,
				rejected: false,
			});
			expect(run({ enforceOverdueBlock: true })).toMatchObject({
				appliedValue: 0,
				rejected: true,
				changes: [],
			});
		},
	);

	test.concurrent(
		"among equal intervals the soonest-expiring row drains first, whatever was created first",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "later", balance: 100 }),
						expires_at: occurredAt + 365 * 86_400_000,
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "sooner", balance: 100 }),
						expires_at: occurredAt + 30 * 86_400_000,
						created_at: occurredAt + 1,
					},
				],
				value: 60,
			});

			expect(balancesAfter(outcome)).toEqual([["sooner", { balance: 40 }]]);
		},
	);

	test.concurrent(
		"a prepaid row drains before a pay-per-use row of the same feature",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [
					{
						...createCustomerEntitlement({ id: "pay_per_use", balance: 5 }),
						usage_allowed: true,
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({ id: "prepaid", balance: 5 }),
						created_at: occurredAt + 1,
					},
				],
				value: 7,
			});

			expect(
				outcome.deltas.map((delta) => [delta.id, delta.balanceDelta]),
			).toEqual([
				["prepaid", -5],
				["pay_per_use", -2],
			]);
		},
	);

	test.concurrent("a refund on an untouched grant is a no-op", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 1000 })],
			value: -10,
		});

		expect(outcome).toMatchObject({
			appliedValue: 0,
			remaining: -10,
			changes: [],
		});
	});

	test.concurrent("overflow lifts the refund ceiling above the grant", () => {
		const outcome = deductFrom({
			customerEntitlements: [createCustomerEntitlement({ balance: 1000 })],
			value: -50,
			overageBehavior: "overflow",
		});

		expect(outcome).toMatchObject({ appliedValue: -50, remaining: 0 });
		expect(balancesAfter(outcome)).toEqual([
			["messages_monthly", { balance: 1050 }],
		]);
	});

	test.concurrent(
		"a zero grant is a ceiling of its own: a refund stops at the row's adjustment",
		() => {
			const state = createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [
					{ ...createCustomerEntitlement({ balance: -5 }), adjustment: 2 },
				],
			});
			const catalog = createCatalogFor({ state });
			for (const entitlement of Object.values(catalog.entitlements)) {
				entitlement.allowance = 0;
			}
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({ org, value: -20 }),
			});

			// up to zero first, then to grant 0 + adjustment 2
			expect(outcome).toMatchObject({ appliedValue: -7, remaining: -13 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: 2 }],
			]);
		},
	);

	test.concurrent(
		"a usage_limit below the grant is a floor above zero: the overage bucket takes nothing",
		() => {
			const state = createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [
					{
						...createCustomerEntitlement({ balance: 50 }),
						usage_allowed: true,
					},
				],
			});
			const catalog = createCatalogFor({ state });
			for (const entitlement of Object.values(catalog.entitlements)) {
				entitlement.usage_limit = 900;
			}
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({ org, value: 80 }),
			});

			expect(outcome).toMatchObject({ appliedValue: 50, remaining: 30 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: 0 }],
			]);
		},
	);

	test.concurrent(
		"fractional values land exactly, never on float noise",
		() => {
			expect(
				balancesAfter(
					deductFrom({
						customerEntitlements: [createCustomerEntitlement({ balance: 0.3 })],
						value: 0.1,
					}),
				),
			).toEqual([["messages_monthly", { balance: 0.2 }]]);
			expect(
				deductFrom({
					customerEntitlements: [createCustomerEntitlement({ balance: 0.001 })],
					value: 0.001,
					overageBehavior: "reject",
				}),
			).toMatchObject({ rejected: false, remaining: 0 });
		},
	);
});
