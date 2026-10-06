import { beforeEach, expect, test } from "bun:test";
import { EntInterval, FeatureType } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { consumeBillingCycleAnchorReset } from "@/external/stripe/webhookHandlers/common/billingCycleAnchorReset/consumeBillingCycleAnchorReset";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import {
	type AutumnBillingPlanBuilder,
	createAutumnBillingPlanBuilder,
} from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

const STRIPE_ANCHOR_SECONDS = 1_790_000_000;

let plan: AutumnBillingPlanBuilder;

beforeEach(() => {
	plan = createAutumnBillingPlanBuilder({ customerId: "customer_123" });
});

const createScenario = ({ landed }: { landed: boolean }) => {
	const dailyCredits = customerEntitlements.create({
		featureId: "daily_credits",
		featureName: "Daily Credits",
		allowance: 1500,
		balance: 1500,
		interval: EntInterval.Day,
	});
	const flag = customerEntitlements.create({
		featureId: "flag",
		featureName: "Flag",
		allowance: 0,
		balance: 0,
		featureType: FeatureType.Boolean,
	});
	const customerProduct = customerProducts.create({
		customerEntitlements: [dailyCredits, flag],
	});
	const eventContext = {
		stripeSubscription: { billing_cycle_anchor: STRIPE_ANCHOR_SECONDS },
		customerProducts: [customerProduct],
		billingCycleAnchorResetCustomerProductIds: landed
			? [customerProduct.id]
			: [],
	} as unknown as InvoiceCreatedContext;
	return { eventContext, dailyCredits };
};

test("a landed anchor move re-phases every resetting row to the new anchor", () => {
	const { eventContext, dailyCredits } = createScenario({ landed: true });

	consumeBillingCycleAnchorReset({ eventContext, plan });

	const { updateCustomerEntitlements, updateCustomerProducts } = plan.build();
	expect(updateCustomerProducts).toHaveLength(1);
	// The boolean row has no reset cycle, so only the daily row moves.
	expect(updateCustomerEntitlements).toHaveLength(1);
	expect(updateCustomerEntitlements?.[0]).toMatchObject({
		customerEntitlement: { id: dailyCredits.id },
		updates: { reset_cycle_anchor: STRIPE_ANCHOR_SECONDS * 1000 },
	});
});

test("a product without a landed anchor move keeps its rows' anchors", () => {
	const { eventContext } = createScenario({ landed: false });

	consumeBillingCycleAnchorReset({ eventContext, plan });

	const { updateCustomerEntitlements, updateCustomerProducts } = plan.build();
	expect(updateCustomerProducts ?? []).toHaveLength(0);
	expect(updateCustomerEntitlements ?? []).toHaveLength(0);
});

test("a landed anchor move merges with a seat-return balance change on the same row", () => {
	const { eventContext, dailyCredits } = createScenario({ landed: true });
	// What processAllocatedPricesForInvoiceCreated plans when a seat is returned.
	plan.updateCustomerEntitlement({
		customerEntitlement: dailyCredits,
		balanceChange: 1,
		deletedReplaceables: [],
	});

	expect(() =>
		consumeBillingCycleAnchorReset({ eventContext, plan }),
	).not.toThrow();

	const { updateCustomerEntitlements } = plan.build();
	const forDailyCredits = (updateCustomerEntitlements ?? []).filter(
		(update) => update.customerEntitlement.id === dailyCredits.id,
	);
	// build() splits the column update from the balance delta.
	expect(forDailyCredits).toHaveLength(2);
	expect(forDailyCredits).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				updates: { reset_cycle_anchor: STRIPE_ANCHOR_SECONDS * 1000 },
			}),
			expect.objectContaining({ balanceChange: 1 }),
		]),
	);
});
