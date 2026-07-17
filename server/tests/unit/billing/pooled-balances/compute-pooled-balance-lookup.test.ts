import { expect, test } from "bun:test";
import {
	EntInterval,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { computePooledBalanceLookup } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceLookup.js";

type UpsertOperation = Extract<PooledBalanceOp, { op: "upsert_source" }>;

const baseOperation: UpsertOperation = {
	op: "upsert_source",
	internalCustomerId: "internal-customer",
	featureId: "messages",
	internalFeatureId: "internal-messages",
	interval: EntInterval.Month,
	intervalCount: 1,
	resetCycleAnchor: 1_800_000_000_000,
	nextResetAt: 1_900_000_000_000,
	rollover: null,
	resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct,
	resetOwnerId: "parent-a",
	priceId: null,
	sourceCustomerProductId: "assignment-a",
	sourceEntitlementId: "entitlement-a",
	currentCycleContribution: 500,
	nextCycleContribution: 500,
};

const lookup = (overrides: Partial<UpsertOperation> = {}) =>
	computePooledBalanceLookup({
		operation: { ...baseOperation, ...overrides },
	});

test("compatible unpriced customer-product owners share one lookup", () => {
	expect(lookup({ resetOwnerId: "parent-a" })).toEqual(
		lookup({ resetOwnerId: "parent-b" }),
	);
});

test("subscription owner identity remains contribution provenance", () => {
	expect(
		lookup({
			resetOwnerType: PooledBalanceResetOwnerType.Subscription,
			resetOwnerId: "subscription-a",
		}),
	).toEqual(
		lookup({
			resetOwnerType: PooledBalanceResetOwnerType.Subscription,
			resetOwnerId: "subscription-b",
		}),
	);
});

test("priced sources with different reset owners still coalesce", () => {
	expect(
		lookup({
			resetOwnerType: PooledBalanceResetOwnerType.Subscription,
			resetOwnerId: "subscription-a",
			priceId: "price-a",
		}),
	).toEqual(
		lookup({
			resetOwnerType: PooledBalanceResetOwnerType.Subscription,
			resetOwnerId: "subscription-b",
			priceId: "price-a",
		}),
	);
});

test("free and customer-product owners share lazy reset semantics", () => {
	expect(lookup({ resetOwnerType: PooledBalanceResetOwnerType.Free })).toEqual(
		lookup({ resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct }),
	);
});

test.each([
	["feature", { internalFeatureId: "internal-credits" }],
	["interval", { interval: EntInterval.Day }],
	["interval count", { intervalCount: 2 }],
	["reset anchor", { resetCycleAnchor: 1_810_000_000_000 }],
	[
		"reset semantics",
		{ resetOwnerType: PooledBalanceResetOwnerType.Subscription },
	],
	["price", { priceId: "price-a" }],
] as const)("different %s creates a separate lookup", (_label, overrides) => {
	expect(lookup()).not.toEqual(lookup(overrides));
});

test("different rollover configuration creates a separate lookup", () => {
	const monthlyRollover = {
		duration: RolloverExpiryDurationType.Month,
		length: 1,
		max: null,
		max_percentage: null,
	};
	expect(lookup({ rollover: monthlyRollover } as never)).not.toEqual(
		lookup({
			rollover: { ...monthlyRollover, length: 2 },
		} as never),
	);
});

test("lifetime pools have no reset owner semantics or anchor", () => {
	expect(
		lookup({
			interval: EntInterval.Lifetime,
			resetCycleAnchor: null,
			nextResetAt: null,
			resetOwnerType: PooledBalanceResetOwnerType.Subscription,
		} as never),
	).toEqual(
		lookup({
			interval: EntInterval.Lifetime,
			resetCycleAnchor: null,
			nextResetAt: null,
			resetOwnerType: PooledBalanceResetOwnerType.Free,
		} as never),
	);
});
