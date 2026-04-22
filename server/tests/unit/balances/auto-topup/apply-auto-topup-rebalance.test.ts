import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	PriceType,
} from "@autumn/shared";

// ---------------------------------------------------------------------------
// Mutable mock state for the mocked modules below.
// `currentFullCustomer` is the "live" FullCustomer the executor will see when it
// calls `getCachedFullCustomer`. Each test sets this up to simulate either a
// clean snapshot or one that has drifted since setup captured it.
// `adjustBalanceSpyCalls` records every call the executor makes to the
// (mocked) atomic delta primitive.
// ---------------------------------------------------------------------------
type AdjustBalanceCall = {
	cusEntId: string;
	delta: number;
};

const mockState: {
	currentFullCustomer: FullCustomer | undefined;
	adjustBalanceSpyCalls: AdjustBalanceCall[];
	cusServiceGetFullCalls: number;
} = {
	currentFullCustomer: undefined,
	adjustBalanceSpyCalls: [],
	cusServiceGetFullCalls: 0,
};

// Mock getCachedFullCustomer — it's the primary "live read" used by the action.
mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer.js",
	() => ({
		getCachedFullCustomer: async () => mockState.currentFullCustomer,
	}),
);

// Mock CusService — fallback path if cache misses. We count invocations so we
// can confirm tests aren't accidentally hitting the fallback when they
// shouldn't be.
mock.module("@/internal/customers/CusService.js", () => ({
	CusService: {
		getFull: async () => {
			mockState.cusServiceGetFullCalls += 1;
			return mockState.currentFullCustomer;
		},
	},
}));

// Mock customerEntitlementActions — specifically adjustBalanceDbAndCache is our
// delta write primitive. Capture each call for assertions.
mock.module(
	"@/internal/customers/cusProducts/cusEnts/actions/index.js",
	() => ({
		customerEntitlementActions: {
			adjustBalanceDbAndCache: async ({
				cusEntId,
				delta,
			}: {
				ctx: unknown;
				customerId: string;
				cusEntId: string;
				delta: number;
			}) => {
				mockState.adjustBalanceSpyCalls.push({ cusEntId, delta });
			},
			updateDbAndCache: async () => {
				throw new Error(
					"updateDbAndCache should NEVER be called by applyAutoTopupRebalance — it routes through the unsafe snapshot path.",
				);
			},
		},
	}),
);

// Import AFTER mocking.
import { applyAutoTopupRebalance } from "@/internal/billing/v2/execute/executeAutumnActions/applyAutoTopupRebalance";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const createCustomerEntitlement = ({
	id,
	balance,
	adjustment = 0,
	quantity = 0,
	usageAllowed = false,
	entities,
	createdAt = 1,
	allowance = 0,
	entityFeatureId = null,
	internalEntityId = null,
}: {
	id: string;
	balance: number;
	adjustment?: number;
	quantity?: number;
	usageAllowed?: boolean;
	entities?: Record<string, EntityBalance>;
	createdAt?: number;
	allowance?: number;
	entityFeatureId?: string | null;
	internalEntityId?: string | null;
}): FullCusEntWithFullCusProduct => {
	const entitlementId = `ent-${id}`;
	const customerProductId = `cus-prod-${id}`;

	return {
		id: `cus-ent-${id}`,
		internal_customer_id: "internal-customer",
		internal_entity_id: internalEntityId,
		internal_feature_id: "internal-feature-messages",
		customer_id: "customer-1",
		feature_id: "messages",
		entitlement_id: entitlementId,
		customer_product_id: customerProductId,
		created_at: createdAt,
		unlimited: false,
		balance,
		additional_balance: 0,
		adjustment,
		entities: entities ?? null,
		usage_allowed: usageAllowed,
		next_reset_at: null,
		expires_at: null,
		cache_version: 0,
		external_id: null,
		replaceables: [],
		rollovers: [],
		entitlement: {
			id: entitlementId,
			internal_feature_id: "internal-feature-messages",
			internal_product_id: "internal-product-1",
			is_custom: false,
			allowance_type: "fixed",
			allowance,
			interval: BillingInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: entityFeatureId,
			org_id: "org-1",
			feature_id: "messages",
			usage_limit: null,
			rollover: null,
			feature: {
				id: "messages",
				internal_id: "internal-feature-messages",
				name: "Messages",
				type: "metered",
				config: {},
				org_id: "org-1",
				env: "sandbox",
				created_at: 1,
				deleted_at: null,
			},
		},
		customer_product: {
			id: customerProductId,
			internal_id: customerProductId,
			internal_customer_id: "internal-customer",
			internal_product_id: "internal-product-1",
			internal_entity_id: null,
			customer_id: "customer-1",
			product_id: `product-${id}`,
			name: `Product ${id}`,
			group: "",
			created_at: 1,
			ended_at: null,
			canceled_at: null,
			cancel_at: null,
			expires_at: null,
			trial_ends_at: null,
			trial_started_at: null,
			anchor_at: null,
			quantity: 1,
			status: "active",
			canceled: false,
			version: 1,
			entity_id: null,
			replaces_customer_product_id: null,
			options: [
				{
					feature_id: "messages",
					internal_feature_id: "internal-feature-messages",
					quantity,
				},
			],
			product: {
				internal_id: "internal-product-1",
				id: `product-${id}`,
				name: `Product ${id}`,
				description: null,
				org_id: "org-1",
				created_at: 1,
				env: "sandbox",
				is_add_on: false,
				is_default: false,
				group: "",
				version: 1,
				processor: {},
				base_variant_id: null,
				archived: false,
				free_trials: [],
				free_trial: null,
				prices: [],
				entitlements: [],
			},
			customer_entitlements: [],
			customer_prices: [
				{
					id: `cus-price-${id}`,
					price_id: `price-${id}`,
					customer_product_id: customerProductId,
					created_at: 1,
					price: {
						id: `price-${id}`,
						org_id: "org-1",
						internal_product_id: "internal-product-1",
						config: {
							type: PriceType.Usage,
							bill_when: BillWhen.InAdvance,
							billing_units: 100,
							internal_feature_id: "internal-feature-messages",
							feature_id: "messages",
							usage_tiers: [{ to: "inf", amount: 10 }],
							interval: BillingInterval.Month,
							interval_count: 1,
							stripe_meter_id: null,
							stripe_price_id: null,
							stripe_empty_price_id: null,
							stripe_product_id: null,
							stripe_placeholder_price_id: null,
							stripe_event_name: null,
							stripe_prepaid_price_v2_id: null,
							should_prorate: false,
						},
						created_at: 1,
						billing_type: null,
						tier_behavior: null,
						is_custom: false,
						entitlement_id: entitlementId,
						proration_config: {},
					},
				},
			],
		},
	} as unknown as FullCusEntWithFullCusProduct;
};

const buildFullCustomer = (
	cusEnts: FullCusEntWithFullCusProduct[],
): FullCustomer => {
	// Minimal FullCustomer shape — fullCustomerToCustomerEntitlements walks
	// customer_products[*].customer_entitlements, so we have to attach cusEnts
	// back to their parent customer_product.
	const productsById = new Map<string, FullCusEntWithFullCusProduct[]>();
	for (const cusEnt of cusEnts) {
		const cusProduct = cusEnt.customer_product;
		if (!cusProduct) continue;
		const existing = productsById.get(cusProduct.id) ?? [];
		existing.push(cusEnt);
		productsById.set(cusProduct.id, existing);
	}

	const customer_products = Array.from(productsById.entries()).map(
		([, ents]) => {
			const sampleProduct = ents[0]?.customer_product!;
			return {
				...sampleProduct,
				customer_entitlements: ents.map((e) => ({ ...e })),
			};
		},
	);

	return {
		id: "customer-1",
		internal_id: "internal-customer",
		org_id: "org-1",
		env: "sandbox",
		customer_products,
		auto_topups: [],
		extra_customer_entitlements: [],
		invoices: [],
		entities: [],
	} as unknown as FullCustomer;
};

// Minimal AutumnContext shim — the action only reads `logger` directly.
const fakeCtx = {
	logger: {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
	},
} as unknown as Parameters<typeof applyAutoTopupRebalance>[0]["ctx"];

const resetMockState = () => {
	mockState.currentFullCustomer = undefined;
	mockState.adjustBalanceSpyCalls = [];
	mockState.cusServiceGetFullCalls = 0;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyAutoTopupRebalance (exec-time live paydown)", () => {
	beforeEach(() => {
		resetMockState();
	});

	test("1. no overage at exec time: full quantity flows to prepaid as a single delta", async () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: 200,
			usageAllowed: true,
		});
		mockState.currentFullCustomer = buildFullCustomer([base, prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: prepaid.id, delta: 600 },
		]);
	});

	test("2. single overage cusEnt: paydown delta, then prepaid remainder delta", async () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -500,
			usageAllowed: true,
		});
		mockState.currentFullCustomer = buildFullCustomer([base, prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: base.id, delta: 500 },
			{ cusEntId: prepaid.id, delta: 100 },
		]);
	});

	test("3. overage exceeds quantity: only paydown is applied, no prepaid call", async () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -1000,
			usageAllowed: true,
		});
		mockState.currentFullCustomer = buildFullCustomer([base, prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: base.id, delta: 600 },
		]);
	});

	test("4. prepaid cusEnt missing at exec time: bails cleanly with no writes", async () => {
		const base = createCustomerEntitlement({
			id: "base",
			balance: -200,
			usageAllowed: true,
		});
		// Note: prepaid is NOT in the live FullCustomer anymore (e.g. was cancelled
		// between ATU enqueue and execution).
		mockState.currentFullCustomer = buildFullCustomer([base]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: "cus-ent-missing-prepaid",
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([]);
	});

	test("5. FullCustomer missing entirely (cache miss + DB miss): no writes", async () => {
		mockState.currentFullCustomer = undefined;

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: "cus-ent-anything",
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([]);
	});

	test("6. entity-scoped cusEnt is excluded from paydown; full quantity flows to prepaid", async () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const entityScoped = createCustomerEntitlement({
			id: "entity-scoped",
			balance: 0,
			usageAllowed: true,
			entityFeatureId: "some-entity-feature",
			entities: {
				"entity-a": {
					id: "entity-a",
					balance: -100,
					adjustment: 0,
					additional_balance: 0,
				},
				"entity-b": {
					id: "entity-b",
					balance: -100,
					adjustment: 0,
					additional_balance: 0,
				},
			},
		});
		mockState.currentFullCustomer = buildFullCustomer([entityScoped, prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 300,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		// entity-scoped overage left in place; full 300 routed to prepaid.
		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: prepaid.id, delta: 300 },
		]);
	});

	test("7. P0 race-safety: live balance deeper than any prior snapshot → paydown sized against LIVE, not snapshot", async () => {
		// This simulates the race: imagine the ATU was originally enqueued when base
		// balance was -500. Between enqueue and exec, concurrent track() drove base
		// to -700. Snapshot-based compute would have computed delta +500 and
		// overwritten to 0, losing 200 of real usage. Our exec-time re-read catches
		// the live -700 and correctly pays down only up to 0.
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -700, // LIVE, deeper than whatever a prior snapshot saw
			usageAllowed: true,
		});
		mockState.currentFullCustomer = buildFullCustomer([base, prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		// Paydown sized against live -700, capped at full quantity 600. No remainder.
		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: base.id, delta: 600 },
		]);
	});

	test("8. Failure B (overcredit guard): live balance shallower than snapshot → paydown sized against LIVE, remainder recomputed", async () => {
		// A prior snapshot may have seen base at -500. By exec time, concurrent refund
		// made it -100. If we blindly applied a snapshot-based +500 delta we'd land at
		// +400 (silent overcredit). The exec-time read sees the live -100, pays down
		// only 100, and routes the full remaining 500 to prepaid.
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -100, // LIVE, shallower than a prior -500 snapshot
			usageAllowed: true,
		});
		mockState.currentFullCustomer = buildFullCustomer([base, prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 600,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: base.id, delta: 100 },
			{ cusEntId: prepaid.id, delta: 500 },
		]);
	});

	test("9. multi-cusEnt divergent drift: each delta sized against its own LIVE balance", async () => {
		// cusEnt A drifted deeper (-500 → -800), cusEnt B drifted shallower
		// (-200 → -50). With quantity 1000 (enough to cover both), paydown should
		// bring each to zero and route the remainder to prepaid. Order of paydown
		// follows our sort: usage_allowed first, then created_at ascending. Both are
		// usage_allowed here so older (createdAt=1) pays down first.
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const cusEntA = createCustomerEntitlement({
			id: "cus-a",
			balance: -800, // LIVE
			usageAllowed: true,
			createdAt: 1,
		});
		const cusEntB = createCustomerEntitlement({
			id: "cus-b",
			balance: -50, // LIVE
			usageAllowed: true,
			createdAt: 2,
		});
		mockState.currentFullCustomer = buildFullCustomer([
			cusEntA,
			cusEntB,
			prepaid,
		]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 1000,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: cusEntA.id, delta: 800 },
			{ cusEntId: cusEntB.id, delta: 50 },
			{ cusEntId: prepaid.id, delta: 150 },
		]);
	});

	test("10. prepaid itself drifted negative: remainder still applied as atomic delta", async () => {
		// User somehow burned prepaid credits concurrently between snapshot and
		// exec. Prepaid is at -30 live. Our remainder delta +100 adds on top,
		// resulting in +70 post-apply. The test asserts the delta is still +100
		// (not something snapshot-derived like "set to 100").
		const prepaid = createCustomerEntitlement({
			id: "prepaid",
			balance: -30, // LIVE
		});
		mockState.currentFullCustomer = buildFullCustomer([prepaid]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 100,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: prepaid.id, delta: 100 },
		]);
	});

	test("11. usage_allowed sorts before non-usage_allowed even under LIVE balances", async () => {
		// Quantity 150 against two overage'd cusEnts: usage-allowed (-100) +
		// non-usage-allowed (-100). Sort puts usage_allowed first → it's zeroed
		// first (delta +100), leaving delta +50 for non-usage-allowed (lands at
		// -50, remainder 0).
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const nonUsageAllowed = createCustomerEntitlement({
			id: "non-usage-allowed",
			balance: -100,
			usageAllowed: false,
			createdAt: 1,
		});
		const usageAllowedCe = createCustomerEntitlement({
			id: "usage-allowed",
			balance: -100,
			usageAllowed: true,
			createdAt: 2,
		});
		mockState.currentFullCustomer = buildFullCustomer([
			nonUsageAllowed,
			usageAllowedCe,
			prepaid,
		]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 150,
				prepaidCustomerEntitlementId: prepaid.id,
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([
			{ cusEntId: usageAllowedCe.id, delta: 100 },
			{ cusEntId: nonUsageAllowed.id, delta: 50 },
		]);
	});

	test("12. quantity 0 is a no-op: no reads, no writes", async () => {
		// Fully defensive — intent with quantity 0 shouldn't do anything, even if
		// the customer happens to have overage.
		mockState.currentFullCustomer = buildFullCustomer([
			createCustomerEntitlement({
				id: "base",
				balance: -500,
				usageAllowed: true,
			}),
			createCustomerEntitlement({ id: "prepaid", balance: 0 }),
		]);

		await applyAutoTopupRebalance({
			ctx: fakeCtx,
			customerId: "customer-1",
			intent: {
				featureId: "messages",
				quantity: 0,
				prepaidCustomerEntitlementId: "cus-ent-prepaid",
			},
		});

		expect(mockState.adjustBalanceSpyCalls).toEqual([]);
	});
});
