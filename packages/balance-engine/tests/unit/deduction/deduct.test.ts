import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	CusProductStatus,
	EntInterval,
	FeatureType,
	getUsageWindowBounds,
	PriceType,
	ResetInterval,
} from "@autumn/shared";
import type {
	Catalog,
	CommandOrg,
	SubjectState,
	WorkerCustomer,
	WorkerCustomerEntitlement,
	WorkerCustomerProduct,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import type { DeductionRequest } from "../../../src/deduction/types/deductionRequest.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	identity,
	occurredAt,
} from "../engineFixtures.js";

const org: CommandOrg = {
	config: {
		reverse_deduction_order: false,
		block_overdue_entitlements: false,
		include_past_due: true,
	},
};

const deductFrom = ({
	customer,
	customerProducts = [createCustomerProduct()],
	customerEntitlements,
	rollovers = [],
	usageWindows = [],
	value,
	overageBehavior = "cap",
	orgConfig = org.config,
	properties = null,
}: {
	customer?: WorkerCustomer;
	customerProducts?: WorkerCustomerProduct[];
	customerEntitlements: WorkerCustomerEntitlement[];
	usageWindows?: WorkerUsageWindow[];
	properties?: Record<string, string> | null;
	rollovers?: {
		id: string;
		cus_ent_id: string;
		balance: number;
		usage: number;
		expires_at: number | null;
	}[];
	value: number;
	overageBehavior?: "cap" | "reject" | "overflow";
	orgConfig?: CommandOrg["config"];
}) =>
	deduct({
		fullSubject: createSubjectFor({
			state: createSubjectState({
				identity,
				customer,
				customerProducts,
				customerEntitlements,
				rollovers,
				usageWindows,
			}),
		}),
		request: createDeductionRequest({
			org: { config: orgConfig },
			overageBehavior,
			properties,
			value,
		}),
	});

const createDeductionRequest = ({
	featureId = "messages",
	internalFeatureId = `feat_${featureId}`,
	value,
	overageBehavior = "cap",
	properties = null,
	enforceOverdueBlock = false,
	now = occurredAt,
	org,
}: Partial<DeductionRequest> &
	Pick<DeductionRequest, "value" | "org">): DeductionRequest => ({
	featureId,
	internalFeatureId,
	value,
	overageBehavior,
	properties,
	enforceOverdueBlock,
	now,
	org,
});

const balancesAfter = (outcome: ReturnType<typeof deduct>) =>
	outcome.changes.map((change) =>
		change.op === "update" ? [change.id, change.after] : change,
	);

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
		"rollovers drain first, soonest expiry first, and count usage",
		() => {
			const outcome = deductFrom({
				customerEntitlements: [createCustomerEntitlement({ balance: 100 })],
				rollovers: [
					{
						id: "ro_late",
						cus_ent_id: "messages_monthly",
						balance: 20,
						usage: 0,
						expires_at: occurredAt + 2000,
					},
					{
						id: "ro_soon",
						cus_ent_id: "messages_monthly",
						balance: 5,
						usage: 0,
						expires_at: occurredAt + 1000,
					},
				],
				value: 30,
			});

			expect(outcome).toMatchObject({ appliedValue: 30, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([
				["messages_monthly", { balance: 95 }],
				["ro_soon", { balance: 0, usage: 5 }],
				["ro_late", { balance: 0, usage: 20 }],
			]);
			expect(outcome.deltas.map((delta) => delta.id)).toEqual([
				"ro_soon",
				"ro_late",
				"messages_monthly",
			]);
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

	const customerWith = (
		controls: Partial<
			Pick<WorkerCustomer, "spend_limits" | "overage_allowed" | "usage_limits">
		>,
	): WorkerCustomer => ({
		internal_id: "cus_1",
		id: "cus_1",
		config: null,
		spend_limits: null,
		overage_allowed: null,
		...controls,
	});

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

	const dailyCap = ({
		limit,
		filter,
	}: {
		limit: number;
		filter?: { properties: Record<string, string> };
	}): WorkerCustomer =>
		customerWith({
			usage_limits: [
				{
					feature_id: "messages",
					enabled: true,
					limit,
					interval: ResetInterval.Day,
					...(filter ? { filter } : {}),
				},
			],
		});
	const today = getUsageWindowBounds({
		interval: EntInterval.Day,
		now: occurredAt,
	});
	const counterRow = ({
		usage,
		windowStartAt = today.windowStartAt,
		windowEndAt = today.windowEndAt,
	}: {
		usage: number;
		windowStartAt?: number;
		windowEndAt?: number;
	}): WorkerUsageWindow => ({
		id: "uw_existing",
		internal_customer_id: "cus_1",
		internal_entity_id: null,
		feature_id: "messages",
		internal_feature_id: "feat_messages",
		filter_key: null,
		anchor_customer_entitlement_id: null,
		window_start_at: windowStartAt,
		window_end_at: windowEndAt,
		usage,
		updated_at: occurredAt - 1,
	});
	const windowChangesOf = (outcome: ReturnType<typeof deduct>) =>
		outcome.changes.filter((change) => change.table === "usageWindows");

	test.concurrent(
		"a daily cap clamps the track across rows onto one new counter",
		() => {
			const outcome = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [
					createCustomerEntitlement({ id: "a", balance: 3 }),
					{
						...createCustomerEntitlement({ id: "b", balance: 10 }),
						created_at: occurredAt + 1,
					},
				],
				value: 10,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 5 });
			expect(windowChangesOf(outcome)).toMatchObject([
				{
					op: "insert",
					row: {
						feature_id: "messages",
						usage: 5,
						window_start_at: today.windowStartAt,
						window_end_at: today.windowEndAt,
						updated_at: occurredAt,
					},
				},
			]);
		},
	);

	test.concurrent(
		"a live counter leaves only its headroom; an expired one reads as zero",
		() => {
			const live = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				usageWindows: [counterRow({ usage: 4 })],
				value: 10,
			});
			expect(live).toMatchObject({ appliedValue: 1, remaining: 9 });
			expect(windowChangesOf(live)).toMatchObject([
				{
					op: "update",
					id: "uw_existing",
					before: { usage: 4 },
					after: { usage: 5 },
				},
			]);

			const expired = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				usageWindows: [
					counterRow({
						usage: 4,
						windowStartAt: today.windowStartAt - 86_400_000,
						windowEndAt: today.windowStartAt,
					}),
				],
				value: 10,
			});
			expect(expired).toMatchObject({ appliedValue: 5, remaining: 5 });
			expect(windowChangesOf(expired)).toMatchObject([
				{
					op: "update",
					id: "uw_existing",
					after: { usage: 5, window_start_at: today.windowStartAt },
				},
			]);
		},
	);

	test.concurrent(
		"a filtered cap binds only events whose properties match",
		() => {
			const customer = dailyCap({
				limit: 5,
				filter: { properties: { model: "gpt" } },
			});
			const rows = [createCustomerEntitlement({ balance: 10 })];

			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					properties: { model: "gpt" },
				}),
			).toMatchObject({ appliedValue: 5 });
			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					properties: { model: "other" },
				}),
			).toMatchObject({ appliedValue: 10 });
		},
	);

	test.concurrent(
		"a window shortfall follows the overage behaviour: reject refuses, overflow bypasses",
		() => {
			const customer = dailyCap({ limit: 5 });
			const rows = [createCustomerEntitlement({ balance: 10 })];

			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					overageBehavior: "reject",
				}),
			).toMatchObject({ rejected: true, changes: [] });
			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					overageBehavior: "overflow",
				}),
			).toMatchObject({
				appliedValue: 10,
				changes: [expect.objectContaining({ table: "customerEntitlements" })],
			});
		},
	);

	/** A `credits` pool whose schema prices messages; the catalog's feature row is what makes it a credit system. */
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
		}: {
			state: SubjectState;
			value: number;
			properties?: Record<string, string> | null;
			overageBehavior?: "cap" | "reject" | "overflow";
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
					properties,
					value,
				}),
			});
		return { creditRow, run };
	};

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
					after: {
						balance: 95,
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
});
