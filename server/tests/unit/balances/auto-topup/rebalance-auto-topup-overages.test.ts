import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	PriceType,
} from "@autumn/shared";
import { rebalanceAutoTopUpOverages } from "@/internal/balances/autoTopUp/compute/rebalanceAutoTopUpOverages";

/**
 * Unit test factory mirroring the one in deduct-from-cus-ents-typescript.test.ts.
 * Produces a minimally-populated FullCusEntWithFullCusProduct for use in
 * rebalanceAutoTopUpOverages tests.
 */
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
}): FullCusEntWithFullCusProduct => {
	const entitlementId = `ent-${id}`;
	const customerProductId = `cus-prod-${id}`;

	return {
		id: `cus-ent-${id}`,
		internal_customer_id: "internal-customer",
		internal_entity_id: null,
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

describe("rebalanceAutoTopUpOverages", () => {
	test("1. empty customer entitlements list returns full remainder", () => {
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [prepaidCustomerEntitlement],
			prepaidCustomerEntitlement,
			quantity: 600,
		});

		expect(result.paydownUpdates).toEqual([]);
		expect(result.remainder).toBe(600);
	});

	test("2. no cusEnt is in overage: remainder equals quantity, no paydown", () => {
		const baseCustomerEntitlement = createCustomerEntitlement({
			id: "base",
			balance: 200,
			usageAllowed: true,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 50,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				baseCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 600,
		});

		expect(result.paydownUpdates).toEqual([]);
		expect(result.remainder).toBe(600);
	});

	test("3. single overage cusEnt, paydown partial: quantity 600 against -500 → +500 delta, remainder 100", () => {
		const baseCustomerEntitlement = createCustomerEntitlement({
			id: "base",
			balance: -500,
			usageAllowed: true,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				baseCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 600,
		});

		expect(result.paydownUpdates).toHaveLength(1);
		expect(result.paydownUpdates[0]?.customerEntitlement.id).toBe(
			baseCustomerEntitlement.id,
		);
		// Race-safe delta (balanceChange), NOT an absolute snapshot. Execution will apply
		// this on top of the live balance via SQL-level `balance + X`.
		expect(result.paydownUpdates[0]?.balanceChange).toBe(500);
		expect(result.paydownUpdates[0]?.updates).toBeUndefined();
		expect(result.remainder).toBe(100);
	});

	test("4. overage exceeds quantity: quantity 600 against -1000 → +600 delta, remainder 0", () => {
		const baseCustomerEntitlement = createCustomerEntitlement({
			id: "base",
			balance: -1000,
			usageAllowed: true,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				baseCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 600,
		});

		expect(result.paydownUpdates).toHaveLength(1);
		expect(result.paydownUpdates[0]?.customerEntitlement.id).toBe(
			baseCustomerEntitlement.id,
		);
		// Full quantity consumed by paydown; applied as a delta (+600).
		expect(result.paydownUpdates[0]?.balanceChange).toBe(600);
		expect(result.paydownUpdates[0]?.updates).toBeUndefined();
		expect(result.remainder).toBe(0);
	});

	test("5. prepaid cusEnt is filtered from paydown pool even when in overage", () => {
		// If the prepaid were somehow at -50, it should NOT receive a paydown update
		// from this helper — the helper's job is paying down non-prepaid cusEnts.
		const baseCustomerEntitlement = createCustomerEntitlement({
			id: "base",
			balance: -100,
			usageAllowed: true,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: -50,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				baseCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 600,
		});

		// Only base should receive a paydown update.
		const updatedIds = result.paydownUpdates.map(
			(u) => u.customerEntitlement.id,
		);
		expect(updatedIds).toEqual([baseCustomerEntitlement.id]);
		expect(result.paydownUpdates[0]?.balanceChange).toBe(100);
		// Remainder = 600 - 100 (base paydown) = 500. Prepaid's -50 is NOT touched here.
		expect(result.remainder).toBe(500);
	});

	test("6. usage_allowed cusEnt sorts before non-usage_allowed during paydown", () => {
		// Two cusEnts both in overage. usage_allowed=true should be paid down first
		// (matching deductor pass-2 sort order for consistent behavior).
		const nonUsageAllowedCustomerEntitlement = createCustomerEntitlement({
			id: "non-usage-allowed",
			balance: -100,
			usageAllowed: false,
			createdAt: 1,
		});
		const usageAllowedCustomerEntitlement = createCustomerEntitlement({
			id: "usage-allowed",
			balance: -100,
			usageAllowed: true,
			createdAt: 2,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		// Quantity 150: should fully zero usage-allowed (the "first" in sort order),
		// and partially pay down non-usage-allowed (+50 delta).
		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				nonUsageAllowedCustomerEntitlement,
				usageAllowedCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 150,
		});

		const usageAllowedUpdate = result.paydownUpdates.find(
			(u) => u.customerEntitlement.id === usageAllowedCustomerEntitlement.id,
		);
		const nonUsageAllowedUpdate = result.paydownUpdates.find(
			(u) =>
				u.customerEntitlement.id === nonUsageAllowedCustomerEntitlement.id,
		);

		expect(usageAllowedUpdate?.balanceChange).toBe(100);
		expect(nonUsageAllowedUpdate?.balanceChange).toBe(50);
		expect(result.remainder).toBe(0);
	});

	test("7. same usage_allowed value: oldest cusEnt (lower created_at) is paid down first", () => {
		const olderCustomerEntitlement = createCustomerEntitlement({
			id: "older",
			balance: -100,
			usageAllowed: true,
			createdAt: 1,
		});
		const newerCustomerEntitlement = createCustomerEntitlement({
			id: "newer",
			balance: -100,
			usageAllowed: true,
			createdAt: 100,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		// Pass the array with newer first to ensure sort (not input order) governs behavior.
		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				newerCustomerEntitlement,
				olderCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 100,
		});

		// Only enough quantity to pay down one. Older should be fully zeroed (+100 delta);
		// newer untouched (no update entry).
		const olderUpdate = result.paydownUpdates.find(
			(u) => u.customerEntitlement.id === olderCustomerEntitlement.id,
		);
		const newerUpdate = result.paydownUpdates.find(
			(u) => u.customerEntitlement.id === newerCustomerEntitlement.id,
		);

		expect(olderUpdate?.balanceChange).toBe(100);
		expect(newerUpdate).toBeUndefined();
		expect(result.remainder).toBe(0);
	});

	test("8. entity-scoped cusEnt (OLD entities-map approach) is excluded from paydown", () => {
		// Entity-scoped balances live in a JSONB `entities` column — there is no
		// race-safe per-entity SQL increment primitive today, so this rebalancer
		// skips them. Any per-entity overage is left to be resolved by a subsequent
		// attach-time flow or a future design that adds atomic JSONB path updates.
		//
		// Observable behavior: the entity-scoped cusEnt is filtered out → the full
		// `quantity` is returned as `remainder` for the caller to route to prepaid.
		const entityScopedCustomerEntitlement = createCustomerEntitlement({
			id: "entity-scoped",
			balance: 0,
			usageAllowed: true,
			entityFeatureId: "entity-feature",
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
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				entityScopedCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 300,
		});

		expect(result.paydownUpdates).toEqual([]);
		expect(result.remainder).toBe(300);
	});

	test("9. mixed pool: entity-scoped is excluded but top-level overage cusEnt still pays down", () => {
		// Same exclusion rule as test 8, but there's also a top-level cusEnt with
		// overage alongside the entity-scoped one. The top-level one should pay down
		// normally; the entity-scoped one contributes zero to the paydown.
		const topLevelCustomerEntitlement = createCustomerEntitlement({
			id: "top-level",
			balance: -200,
			usageAllowed: true,
		});
		const entityScopedCustomerEntitlement = createCustomerEntitlement({
			id: "entity-scoped",
			balance: 0,
			usageAllowed: true,
			entityFeatureId: "entity-feature",
			entities: {
				"entity-a": {
					id: "entity-a",
					balance: -100,
					adjustment: 0,
					additional_balance: 0,
				},
			},
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				topLevelCustomerEntitlement,
				entityScopedCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 500,
		});

		// Only the top-level cusEnt receives a paydown delta.
		expect(result.paydownUpdates).toHaveLength(1);
		expect(result.paydownUpdates[0]?.customerEntitlement.id).toBe(
			topLevelCustomerEntitlement.id,
		);
		expect(result.paydownUpdates[0]?.balanceChange).toBe(200);
		// Remainder = 500 - 200 = 300. Entity-scoped overage remains unpaid.
		expect(result.remainder).toBe(300);
	});

	test("10. P0 regression: paydown output is a DELTA, not a snapshot — race-safe against concurrent usage", () => {
		// Scenario: rebalancer computes its plan from a snapshot showing balance=-500,
		// then usage is recorded (balance becomes -700 in reality), then execution applies
		// the paydown. If the output were a snapshot `updates.balance = 0`, the live -700
		// would be overwritten to 0 — erasing 200 of real usage.
		//
		// With delta output `balanceChange = +500`, the execution path uses SQL
		// `balance = balance + 500`, which produces -200 — preserving the concurrent usage.
		//
		// This test asserts the shape that guarantees the race-safe behavior: no `updates`
		// key (which would route through updateDbAndCache and overwrite), only
		// `balanceChange` (which routes through adjustBalanceDbAndCache / CusEntService
		// atomic increment).
		const snapshotBalance = -500;
		const baseCustomerEntitlement = createCustomerEntitlement({
			id: "base",
			balance: snapshotBalance,
			usageAllowed: true,
		});
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
		});

		const result = rebalanceAutoTopUpOverages({
			customerEntitlements: [
				baseCustomerEntitlement,
				prepaidCustomerEntitlement,
			],
			prepaidCustomerEntitlement,
			quantity: 600,
		});

		const paydownEntry = result.paydownUpdates[0];
		expect(paydownEntry).toBeDefined();

		// Shape guarantees:
		// 1. balanceChange is set (routes to atomic SQL increment).
		expect(paydownEntry?.balanceChange).toBe(500);
		// 2. updates is NOT set (would route to absolute overwrite).
		expect(paydownEntry?.updates).toBeUndefined();

		// Simulate what execution does on a live balance that moved after the snapshot:
		const liveBalanceAfterConcurrentUsage = -700;
		const appliedBalance =
			liveBalanceAfterConcurrentUsage + (paydownEntry?.balanceChange ?? 0);
		// The concurrent 200 usage is preserved — we land at -200, not at 0.
		expect(appliedBalance).toBe(-200);
	});
});
