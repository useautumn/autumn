import { expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	ResetInterval,
} from "@autumn/shared";
import {
	getAllocatableSharedBalanceInterval,
	getCustomerBalanceSourceLabel,
} from "@/views/customers2/components/table/customer-balance/customerBalanceUtils";

test("uses a standalone balance id as its source label", () => {
	const balance = {
		external_id: "goodwill",
		customer_product: null,
		pooled_balance_id: null,
		pooled_balance: null,
		entitlement: {
			interval: EntInterval.Lifetime,
			interval_count: 1,
			feature: { type: FeatureType.Metered },
		},
	} as unknown as FullCusEntWithFullCusProduct;

	expect(getCustomerBalanceSourceLabel({ balance, entities: [] })).toBe(
		"goodwill · Lifetime",
	);
});

const allocationBalance = ({
	interval = EntInterval.Month,
	intervalCount = 1,
	entityId = null,
	unlimited = false,
}: {
	interval?: EntInterval;
	intervalCount?: number;
	entityId?: string | null;
	unlimited?: boolean;
} = {}) =>
	({
		customer_product: null,
		internal_entity_id: entityId,
		is_pooled_balance: true,
		pooled_balance_id: "pool_123",
		pooled_balance: { granted: 1000 },
		balance: 1000,
		unlimited,
		next_reset_at: Date.now() + 86_400_000,
		entitlement: {
			interval,
			interval_count: intervalCount,
			allowance: unlimited ? null : 0,
			allowance_type: unlimited ? AllowanceType.Unlimited : AllowanceType.Fixed,
			feature: { id: "credits", type: FeatureType.CreditSystem },
		},
	}) as unknown as FullCusEntWithFullCusProduct;

test("monthly pooled credits remain allocatable beside one-off credits and entity balances", () => {
	expect(
		getAllocatableSharedBalanceInterval({
			customerEntitlements: [
				allocationBalance(),
				allocationBalance({ interval: EntInterval.Lifetime }),
				allocationBalance({ entityId: "entity_123", unlimited: true }),
			],
		}),
	).toBe(ResetInterval.Month);
});

test("one-off and entity-only balances are not allocatable", () => {
	for (const balance of [
		allocationBalance({ interval: EntInterval.Lifetime }),
		allocationBalance({ entityId: "entity_123" }),
	]) {
		expect(
			getAllocatableSharedBalanceInterval({ customerEntitlements: [balance] }),
		).toBeUndefined();
	}
});

test("unsupported multi-interval and unlimited balances stay excluded", () => {
	for (const balance of [
		allocationBalance({ intervalCount: 3 }),
		allocationBalance({ unlimited: true }),
	]) {
		expect(
			getAllocatableSharedBalanceInterval({ customerEntitlements: [balance] }),
		).toBeUndefined();
	}
});
