import { describe, expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import type {
	Catalog,
	SubjectState,
	WorkerCustomerEntitlement,
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
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import {
	balancesAfter,
	createDeductionRequest,
	customerWith,
} from "./deductionFixtures.js";

const creditsSystem = ({
	schemaItem,
}: {
	schemaItem: Record<string, unknown>;
}) => {
	const creditRow = (
		balance: number,
		extra: Partial<WorkerCustomerEntitlement> = {},
	) => ({
		...createCustomerEntitlement({
			id: "credits_row",
			featureId: "credits",
			balance,
		}),
		...extra,
	});
	const withCatalog = ({ state }: { state: SubjectState }): Catalog => {
		const catalog = createCatalogFor({ state });
		const credits = catalog.features.feat_credits;
		if (!credits) throw new Error("credits feature row missing");
		credits.type = FeatureType.CreditSystem;
		credits.config = {
			schema: [
				{ metered_feature_id: "messages", feature_amount: 1, ...schemaItem },
			],
		};
		return catalog;
	};
	const run = ({
		state,
		value,
		properties = null,
		overageBehavior = "cap" as const,
		includesCreditSystems = true,
	}: {
		state: SubjectState;
		value: number;
		properties?: Record<string, string> | null;
		overageBehavior?: "cap" | "reject" | "overflow";
		includesCreditSystems?: boolean;
	}) =>
		deduct({
			fullSubject: subjectStateToFullSubject({
				state,
				catalog: withCatalog({ state }),
			}),
			request: createDeductionRequest({
				internalFeatureId: "feat_messages",
				org,
				overageBehavior,
				includesCreditSystems,
				properties,
				value,
			}),
		});
	return { creditRow, run };
};

describe("credit systems", () => {
	test.concurrent(
		"a credit system funds the tracked feature at its flat rate, after the feature's own rows",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 2 },
			});
			const outcome = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [
						createCustomerEntitlement({ id: "own", balance: 3 }),
						creditRow(100),
					],
				}),
				value: 5,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [
					delta.id,
					delta.balanceDelta,
					delta.valueDelta,
					delta.creditCost,
				]),
			).toEqual([
				["own", -3, -3, 1],
				["credits_row", -4, -2, 2],
			]);
			expect(balancesAfter(outcome)).toEqual([
				["own", { balance: 0 }],
				["credits_row", { balance: 96 }],
			]);
		},
	);

	test.concurrent(
		"without credit systems, only the feature's own rows are drawn",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 2 },
			});
			const outcome = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [
						createCustomerEntitlement({ id: "own", balance: 3 }),
						creditRow(100),
					],
				}),
				value: 5,
				includesCreditSystems: false,
			});

			expect(outcome).toMatchObject({ appliedValue: 3, remaining: 2 });
			expect(balancesAfter(outcome)).toEqual([["own", { balance: 0 }]]);
		},
	);

	test.concurrent("a dimensioned rate prices by the event's properties", () => {
		const { creditRow, run } = creditsSystem({
			schemaItem: {
				credit_amount: 1,
				dimensions: { large: { match: { size: "large" }, credit_amount: 4 } },
			},
		});
		const state = createSubjectState({
			identity,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [creditRow(100)],
		});

		expect(run({ state, value: 5 })).toMatchObject({
			deltas: [expect.objectContaining({ balanceDelta: -5 })],
		});
		expect(
			run({ state, value: 5, properties: { size: "large" } }),
		).toMatchObject({
			deltas: [expect.objectContaining({ balanceDelta: -20, creditCost: 4 })],
		});
	});

	test.concurrent(
		"graduated tiers charge from the units already attributed and record the attribution",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: {
					tier_behavior: "graduated",
					tiers: [
						{ to: 2, credit_amount: 1 },
						{ to: "inf", credit_amount: 3 },
					],
				},
			});
			const first = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [creditRow(100)],
				}),
				value: 3,
			});
			// 2 units at 1 credit, then 1 at 3 = 5 credits
			expect(first.deltas).toMatchObject([
				{
					balanceDelta: -5,
					valueDelta: -3,
					usageAttributionDelta: {
						customerEntitlementId: "credits_row",
						key: "feat_messages",
						units: 3,
						credits: 5,
					},
				},
			]);
			expect(first.changes).toMatchObject([
				{
					id: "credits_row",
					op: "increment",
					add: { balance: -5 },
					addEntries: {
						usage_attribution: { feat_messages: { units: 3, credits: 5 } },
					},
				},
			]);

			const second = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [
						creditRow(95, {
							usage_attribution: { feat_messages: { units: 3, credits: 5 } },
						}),
					],
				}),
				value: 1,
			});
			// the fourth unit sits in the 3-credit tier
			expect(second.deltas).toMatchObject([
				{ balanceDelta: -3, valueDelta: -1 },
			]);
		},
	);

	test.concurrent(
		"a check against credits refuses what the pool cannot fund",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 2 },
			});
			const state = createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [creditRow(6)],
			});

			expect(run({ state, value: 3, overageBehavior: "reject" })).toMatchObject(
				{ rejected: false, appliedValue: 3 },
			);
			expect(run({ state, value: 4, overageBehavior: "reject" })).toMatchObject(
				{ rejected: true, remaining: 1 },
			);
		},
	);

	test.concurrent(
		"a zero rate charges the pool one credit per unit and leaves its rollovers untouched",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 0 },
			});
			const outcome = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [
						createCustomerEntitlement({ id: "own", balance: 3 }),
						creditRow(100),
					],
					rollovers: [
						{
							id: "ro_credits",
							cus_ent_id: "credits_row",
							balance: 50,
							usage: 0,
							expires_at: null,
							entities: {},
						},
					],
				}),
				value: 5,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [
					delta.id,
					delta.balanceDelta,
					delta.creditCost,
				]),
			).toEqual([
				["own", -3, 1],
				["credits_row", -2, 1],
			]);
		},
	);

	test.concurrent(
		"a free tier hands out units and records attribution without moving the balance",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: {
					tier_behavior: "graduated",
					tiers: [
						{ to: 5, credit_amount: 0 },
						{ to: "inf", credit_amount: 1 },
					],
				},
			});
			const state = createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [creditRow(100)],
			});

			const free = run({ state, value: 3, overageBehavior: "reject" });
			expect(free).toMatchObject({
				appliedValue: 3,
				remaining: 0,
				rejected: false,
			});
			expect(free.deltas).toEqual([
				expect.objectContaining({
					id: "credits_row",
					balanceDelta: 0,
					valueDelta: -3,
					creditCost: 0,
					usageAttributionDelta: expect.objectContaining({
						units: 3,
						credits: 0,
					}),
				}),
			]);
			expect(balancesAfter(free)).toEqual([
				[
					"credits_row",
					{ usage_attribution: { feat_messages: { units: 3, credits: 0 } } },
				],
			]);

			// From 3 attributed units: 2 more free, then 5 paid.
			const paid = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [
						creditRow(100, {
							usage_attribution: { feat_messages: { units: 3, credits: 0 } },
						}),
					],
				}),
				value: 7,
			});
			expect(paid).toMatchObject({ appliedValue: 7 });
			expect(balancesAfter(paid)).toEqual([
				[
					"credits_row",
					{
						balance: 95,
						usage_attribution: { feat_messages: { units: 10, credits: 5 } },
					},
				],
			]);
		},
	);

	test.concurrent(
		"a graduated refund reprices at the current tier position and drops an attribution that nets to zero",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: {
					tier_behavior: "graduated",
					tiers: [
						{ to: 10, credit_amount: 1 },
						{ to: "inf", credit_amount: 0.5 },
					],
				},
			});
			const attributed = creditRow(100, {
				usage_attribution: { feat_messages: { units: 15, credits: 12.5 } },
			});
			const stateOf = () =>
				createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [attributed],
				});

			// 15 → 5 units: the top 5 at 0.5 and 5 at 1 come back, not 10 × the original average.
			const partial = run({ state: stateOf(), value: -10 });
			expect(partial).toMatchObject({ appliedValue: -10 });
			expect(balancesAfter(partial)).toEqual([
				[
					"credits_row",
					{
						balance: 107.5,
						usage_attribution: { feat_messages: { units: 5, credits: 5 } },
					},
				],
			]);

			const full = run({ state: stateOf(), value: -15 });
			expect(balancesAfter(full)).toEqual([
				["credits_row", { balance: 112.5, usage_attribution: {} }],
			]);
		},
	);

	test.concurrent(
		"an entitlement's feature_override replaces the credit system's schema",
		() => {
			const { creditRow } = creditsSystem({
				schemaItem: { credit_amount: 0.2 },
			});
			const state = createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [creditRow(100)],
			});
			const catalog = createCatalogFor({ state });
			const credits = catalog.features.feat_credits;
			if (!credits) throw new Error("credits feature row missing");
			credits.type = FeatureType.CreditSystem;
			credits.config = {
				schema: [
					{
						metered_feature_id: "messages",
						feature_amount: 1,
						credit_amount: 0.2,
					},
				],
			};
			for (const entitlement of Object.values(catalog.entitlements)) {
				entitlement.feature_override = {
					schema: [
						{
							metered_feature_id: "messages",
							feature_amount: 1,
							credit_amount: 0.5,
						},
					],
				};
			}
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({
					internalFeatureId: "feat_messages",
					org,
					value: 10,
				}),
			});

			expect(balancesAfter(outcome)).toEqual([
				["credits_row", { balance: 95 }],
			]);
		},
	);

	test.concurrent(
		"two credit systems fund one feature in order, each at its own rate",
		() => {
			const state = createSubjectState({
				identity,
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [
					{
						...createCustomerEntitlement({
							id: "credits_row",
							featureId: "credits",
							balance: 2,
						}),
						created_at: occurredAt,
					},
					{
						...createCustomerEntitlement({
							id: "credits2_row",
							featureId: "credits2",
							balance: 100,
						}),
						created_at: occurredAt + 1,
					},
				],
			});
			const catalog = createCatalogFor({ state });
			for (const [internalId, rate] of [
				["feat_credits", 0.2],
				["feat_credits2", 0.5],
			] as const) {
				const feature = catalog.features[internalId];
				if (!feature) throw new Error(`${internalId} row missing`);
				feature.type = FeatureType.CreditSystem;
				feature.config = {
					schema: [
						{
							metered_feature_id: "messages",
							feature_amount: 1,
							credit_amount: rate,
						},
					],
				};
			}
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({
					internalFeatureId: "feat_messages",
					org,
					value: 30,
				}),
			});

			// 2 credits at 0.2 cover 10 units; the other 20 cost 10 credits at 0.5.
			expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [
					delta.id,
					delta.balanceDelta,
					delta.valueDelta,
				]),
			).toEqual([
				["credits_row", -2, -10],
				["credits2_row", -10, -20],
			]);
		},
	);

	test.concurrent(
		"a rollover on a credit pool charges at its owner's rate",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 0.2 },
			});
			const outcome = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [creditRow(10)],
					rollovers: [
						{
							id: "ro_credits",
							cus_ent_id: "credits_row",
							balance: 1,
							usage: 0,
							expires_at: null,
							entities: {},
						},
					],
				}),
				value: 8,
			});

			// 1 rollover credit is 5 units; the other 3 units cost 0.6 from the pool.
			expect(outcome).toMatchObject({ appliedValue: 8, remaining: 0 });
			expect(
				outcome.deltas.map((delta) => [
					delta.id,
					delta.balanceDelta,
					delta.valueDelta,
				]),
			).toEqual([
				["ro_credits", -1, -5],
				["credits_row", -0.6, -3],
			]);
		},
	);

	test.concurrent(
		"a spend limit on a credit pool is denominated in credits",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 0.2 },
			});
			const outcome = run({
				state: createSubjectState({
					identity,
					customer: customerWith({
						spend_limits: [
							{ feature_id: "credits", enabled: true, overage_limit: 5 },
						],
					}),
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [creditRow(0, { usage_allowed: true })],
				}),
				value: 100,
			});

			// 5 credits of headroom buys 25 units at 0.2.
			expect(outcome).toMatchObject({ appliedValue: 25, remaining: 75 });
			expect(balancesAfter(outcome)).toEqual([
				["credits_row", { balance: -5 }],
			]);
		},
	);

	test.concurrent(
		"an unlimited credit pool leads the draw even though credit systems sort last",
		() => {
			const { creditRow, run } = creditsSystem({
				schemaItem: { credit_amount: 0.2 },
			});
			const outcome = run({
				state: createSubjectState({
					identity,
					customerProducts: [createCustomerProduct()],
					customerEntitlements: [
						createCustomerEntitlement({ id: "own", balance: 3 }),
						creditRow(0, { unlimited: true }),
					],
				}),
				value: 30,
			});

			expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([
				["credits_row", { balance: -6 }],
			]);
		},
	);
});
