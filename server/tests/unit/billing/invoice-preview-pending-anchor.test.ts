import { describe, expect, test } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/index.js";
import { setupInvoicePreviewPendingAnchor } from "@/internal/customers/cusUtils/cusResponseUtils/setupInvoicePreviewPendingAnchor";

const nowMs = Date.UTC(2026, 9, 11);
const anchorMs = Date.UTC(2026, 9, 21);

const customerProduct = (resetsAt: number | null) =>
	({ billing_cycle_anchor_resets_at: resetsAt }) as FullCusProduct;

const subscriptionWithPhases = (
	phases: { start_date: number; proration_behavior?: string }[],
) => ({ schedule: { phases } }) as unknown as ExpandedStripeSubscription;

describe("setupInvoicePreviewPendingAnchor", () => {
	test("takes the earliest anchor reset still ahead of now", () => {
		const { pendingBillingCycleAnchorMs } = setupInvoicePreviewPendingAnchor({
			customerProducts: [
				customerProduct(nowMs - 1000),
				customerProduct(null),
				customerProduct(anchorMs + 1000),
				customerProduct(anchorMs),
			],
			stripeSubscription: subscriptionWithPhases([]),
			nowMs,
		});

		expect(pendingBillingCycleAnchorMs).toBe(anchorMs);
	});

	test("has no pending anchor once every reset has passed", () => {
		const { pendingBillingCycleAnchorMs } = setupInvoicePreviewPendingAnchor({
			customerProducts: [customerProduct(nowMs - 1000)],
			stripeSubscription: subscriptionWithPhases([]),
			nowMs,
		});

		expect(pendingBillingCycleAnchorMs).toBeUndefined();
	});

	test("reads the Stripe phases that skip proration", () => {
		const { schedulePhaseProrations } = setupInvoicePreviewPendingAnchor({
			customerProducts: [],
			stripeSubscription: subscriptionWithPhases([
				{ start_date: nowMs / 1000, proration_behavior: "create_prorations" },
				{ start_date: anchorMs / 1000, proration_behavior: "none" },
			]),
			nowMs,
		});

		expect(schedulePhaseProrations).toEqual([
			{ startsAt: anchorMs, prorationBehavior: "none" },
		]);
	});

	test("a subscription without a schedule has no phase prorations", () => {
		const { schedulePhaseProrations } = setupInvoicePreviewPendingAnchor({
			customerProducts: [],
			stripeSubscription: {
				schedule: null,
			} as unknown as ExpandedStripeSubscription,
			nowMs,
		});

		expect(schedulePhaseProrations).toEqual([]);
	});
});
