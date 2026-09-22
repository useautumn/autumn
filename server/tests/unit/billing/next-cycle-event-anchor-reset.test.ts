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
	endedAt,
	resetAt,
}: {
	id: string;
	startsAt: number;
	endedAt?: number;
	resetAt?: number;
}) =>
	({
		id,
		starts_at: startsAt,
		ended_at: endedAt ?? null,
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

// A scheduled switch landing exactly on the renewal boundary is still a product
// transition. Classifying it as a renewal drops the incoming plan's line items,
// because only the renewal path filters them to the boundary's billing period.
test("scheduled switch on the renewal boundary classifies as a scheduled change", () => {
	const boundaryMs = Date.UTC(2026, 9, 21, 22, 40, 2);
	const outgoingMonthly = customerProduct({
		id: "monthly",
		startsAt: Date.UTC(2026, 8, 21, 22, 40, 2),
		endedAt: boundaryMs,
	});
	const incomingAnnual = customerProduct({
		id: "annual",
		startsAt: boundaryMs,
	});
	const customerProducts = [outgoingMonthly, incomingAnnual];

	const event = classifyNextCycleEvent({
		billingContext: {} as BillingContext,
		customerProducts,
		normalizedCustomerProducts: customerProducts,
		startsAtMs: boundaryMs,
		renewalBoundaryMs: boundaryMs,
		smallestInterval: { interval: BillingInterval.Month, intervalCount: 1 },
	});

	expect(event).toMatchObject({
		kind: "scheduled_change",
		startsAtMs: boundaryMs,
		incomingCustomerProducts: [incomingAnnual],
		outgoingCustomerProducts: [outgoingMonthly],
	});
});
