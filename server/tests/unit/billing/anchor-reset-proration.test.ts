// A timestamp anchor's reset phase carries the request's proration, as Stripe
// applies a phase's own proration_behavior; with none it invoices nothing at the anchor.

import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	BillingInterval,
	type FullCusProduct,
} from "@autumn/shared";
import { firstPhaseAnchorResetProration } from "@/internal/billing/v2/actions/setPlans/utils/firstPhaseAnchorResetProration";
import { computeScheduledAnchorResetPreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/computeScheduledAnchorResetPreview";
import { classifyNextCycleEvent } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/getNextCycleEvent/classifyNextCycleEvent";

const periodStartMs = Date.UTC(2026, 9, 6, 12);
const anchorMs = Date.UTC(2026, 9, 16, 12);

describe("firstPhaseAnchorResetProration", () => {
	test("a timestamp anchor carries the first phase's none onto its reset phase", () => {
		expect(
			firstPhaseAnchorResetProration({
				billingContext: {
					requestedBillingCycleAnchor: anchorMs,
					requestedProrationBehavior: "none",
				},
			}),
		).toEqual([{ startsAt: anchorMs, prorationBehavior: "none" }]);
	});

	test("reset now and bill_difference leave the reset phase to the default rule", () => {
		expect(
			firstPhaseAnchorResetProration({
				billingContext: {
					requestedBillingCycleAnchor: "now",
					requestedProrationBehavior: "none",
				},
			}),
		).toEqual([]);
		expect(
			firstPhaseAnchorResetProration({
				billingContext: {
					requestedBillingCycleAnchor: anchorMs,
					requestedProrationBehavior: "bill_difference",
				},
			}),
		).toEqual([]);
	});
});

test("a pure anchor reset classifies with the reset phase's proration", () => {
	const keptProduct = {
		id: "kept",
		starts_at: periodStartMs,
		ended_at: null,
		billing_cycle_anchor_resets_at: anchorMs,
		product: { group: null, is_add_on: false },
	} as unknown as FullCusProduct;

	const event = classifyNextCycleEvent({
		billingContext: {} as BillingContext,
		customerProducts: [keptProduct],
		normalizedCustomerProducts: [keptProduct],
		startsAtMs: anchorMs,
		renewalBoundaryMs: Date.UTC(2026, 10, 6, 12),
		smallestInterval: { interval: BillingInterval.Month, intervalCount: 1 },
		phaseProrations: [{ startsAt: anchorMs, prorationBehavior: "none" }],
	});

	expect(event).toMatchObject({
		kind: "anchor_reset",
		prorationBehavior: "none",
	});
});

describe("computeScheduledAnchorResetPreview", () => {
	const billingContext = {
		requestedBillingCycleAnchor: anchorMs,
		currentEpochMs: periodStartMs + 1000,
		stripeSubscription: { billing_cycle_anchor: periodStartMs / 1000 },
	} as unknown as BillingContext;

	test("by default, the anchor invoices the netted extra window", () => {
		const result = computeScheduledAnchorResetPreview({
			billingContext,
			interval: BillingInterval.Month,
			intervalCount: 1,
		});

		expect(result.nextCycleStart).toBe(anchorMs);
		expect(result.prorationRatio?.toNumber()).toBeCloseTo(10 / 31, 6);
	});
});
