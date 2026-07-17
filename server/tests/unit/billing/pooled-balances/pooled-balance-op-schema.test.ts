// Red: malformed pooled ops survive plan parsing and fail only at the DB constraint or executor.
// Green: the plan schema rejects negative grants and non-positive/fractional interval counts.
import { expect, test } from "bun:test";
import {
	EntInterval,
	PooledBalanceResetOwnerType,
	UpsertPooledBalanceSourceOpSchema,
} from "@autumn/shared";

const validOperation = {
	op: "upsert_source" as const,
	internalCustomerId: "customer_internal",
	sourceCustomerProductId: "customer_product_source",
	featureId: "messages",
	internalFeatureId: "feature_internal",
	interval: EntInterval.Month,
	intervalCount: 1,
	resetCycleAnchor: Date.UTC(2027, 0, 1),
	nextResetAt: Date.UTC(2027, 1, 1),
	rollover: null,
	resetOwnerType: PooledBalanceResetOwnerType.Free,
	resetOwnerId: "customer_product_source",
	priceId: null,
	sourceEntitlementId: "entitlement_source",
	currentCycleContribution: 500,
	nextCycleContribution: 500,
};

test("pooled upsert schema rejects negative contribution grants", () => {
	for (const contributionField of [
		"currentCycleContribution",
		"nextCycleContribution",
	] as const) {
		expect(
			UpsertPooledBalanceSourceOpSchema.safeParse({
				...validOperation,
				[contributionField]: -1,
			}).success,
		).toBe(false);
	}
});

test("pooled upsert schema requires a positive integer interval count", () => {
	for (const intervalCount of [0, -1, 1.5]) {
		expect(
			UpsertPooledBalanceSourceOpSchema.safeParse({
				...validOperation,
				intervalCount,
			}).success,
		).toBe(false);
	}
});
