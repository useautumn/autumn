// A phase reset must survive classification when it only starts a product.
// The preview uses this metadata to charge the incoming product from phase start.

import { expect, test } from "bun:test";
import {
	type BillingContext,
	BillingInterval,
	type FullCusProduct,
} from "@autumn/shared";
import { classifyNextCycleEvent } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/getNextCycleEvent/classifyNextCycleEvent";

const customerProduct = ({
	id,
	startsAt,
	resetAt,
}: {
	id: string;
	startsAt: number;
	resetAt?: number;
}) =>
	({
		id,
		starts_at: startsAt,
		ended_at: null,
		billing_cycle_anchor_resets_at: resetAt ?? null,
		product: { group: null, is_add_on: false },
	}) as unknown as FullCusProduct;

test("scheduled start carries its second-normalized phase anchor reset", () => {
	const startsAtMs = Date.UTC(2026, 6, 20, 10);
	const stableProduct = customerProduct({ id: "stable", startsAt: 0 });
	const incomingProduct = customerProduct({
		id: "incoming",
		startsAt: startsAtMs,
		resetAt: startsAtMs + 999,
	});

	const event = classifyNextCycleEvent({
		billingContext: {} as BillingContext,
		customerProducts: [stableProduct, incomingProduct],
		normalizedCustomerProducts: [stableProduct, incomingProduct],
		startsAtMs,
		renewalBoundaryMs: startsAtMs + 86_400_000,
		smallestInterval: { interval: BillingInterval.Month, intervalCount: 1 },
	});

	expect(event).toMatchObject({
		kind: "scheduled_start",
		startsAtMs,
		resetsBillingCycle: true,
		customerProducts: [incomingProduct],
	});
});
