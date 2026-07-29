import { expect } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { pollUntil } from "@tests/utils/genUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { and, eq, inArray } from "drizzle-orm";

const STRIPE_TIMESTAMP_TOLERANCE_MS = 1000;

export const expectAssignmentEntitlementCyclesMatchStripe = async ({
	ctx,
	customerId,
	assignmentIds,
	featureId,
	expectNextResetAt = true,
}: {
	ctx: TestContext;
	customerId: string;
	assignmentIds: string[];
	featureId: string;
	expectNextResetAt?: boolean;
}) => {
	const { subscription } = await getStripeSubscription({ customerId });
	const subscriptionItem = subscription.items.data[0];
	if (!subscriptionItem) throw new Error("Expected a Stripe subscription item");

	const expectedResetCycleAnchor = subscription.billing_cycle_anchor * 1000;
	const expectedNextResetAt = subscriptionItem.current_period_end * 1000;
	const cycles = await pollUntil({
		fetch: () =>
			ctx.db
				.select({
					customerProductId: customerEntitlements.customer_product_id,
					resetCycleAnchor: customerEntitlements.reset_cycle_anchor,
					nextResetAt: customerEntitlements.next_reset_at,
				})
				.from(customerEntitlements)
				.where(
					and(
						inArray(customerEntitlements.customer_product_id, assignmentIds),
						eq(customerEntitlements.feature_id, featureId),
					),
				),
		until: (rows) =>
			rows.length === assignmentIds.length &&
			rows.every(
				(row) =>
					row.resetCycleAnchor !== null &&
					Math.abs(row.resetCycleAnchor - expectedResetCycleAnchor) <
						STRIPE_TIMESTAMP_TOLERANCE_MS &&
					(!expectNextResetAt ||
						(row.nextResetAt !== null &&
							Math.abs(row.nextResetAt - expectedNextResetAt) <
								STRIPE_TIMESTAMP_TOLERANCE_MS)),
			),
		timeoutMs: 10_000,
		intervalMs: 250,
	});

	expect(cycles).toHaveLength(assignmentIds.length);
	for (const cycle of cycles) {
		expect(cycle.resetCycleAnchor).not.toBeNull();
		expect(
			Math.abs((cycle.resetCycleAnchor ?? 0) - expectedResetCycleAnchor),
		).toBeLessThan(STRIPE_TIMESTAMP_TOLERANCE_MS);
		if (expectNextResetAt) {
			expect(cycle.nextResetAt).not.toBeNull();
			expect(
				Math.abs((cycle.nextResetAt ?? 0) - expectedNextResetAt),
			).toBeLessThan(STRIPE_TIMESTAMP_TOLERANCE_MS);
		}
	}

	return { subscription, cycles };
};
