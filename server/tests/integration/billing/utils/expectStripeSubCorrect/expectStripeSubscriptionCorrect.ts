import { expect } from "bun:test";
import {
	customerProductsToStripeSubscriptionIds,
	notNullish,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";
import type { ExpectStripeSubOptions } from "./types";
import { verifySubscription } from "./verifySubscription";

/**
 * Verifies that all Stripe subscriptions for a customer match the expected state
 * derived from their customer products. Handles multiple subscriptions (new_billing_subscription),
 * inline entity-scoped prices, schedules, and cancellation.
 */
export const expectStripeSubscriptionCorrect = async ({
	ctx,
	customerId,
	options,
}: {
	ctx: TestContext;
	customerId: string;
	options?: ExpectStripeSubOptions;
}) => {
	// 1. Fetch full customer
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});

	const cusProducts = fullCustomer.customer_products;

	// 2. Validate total subscription count if requested
	if (options?.subCount !== undefined) {
		const stripeCustomerId = fullCustomer.processor?.id;
		expect(
			stripeCustomerId,
			`Customer ${customerId} has no Stripe processor ID`,
		).toBeDefined();

		const subs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		});
		expect(subs.data.length).toBe(options.subCount);
	}

	// 3. Determine which subscriptions to verify
	if (options?.subId) {
		await verifySubscription({
			ctx,
			subId: options.subId,
			cusProducts,
			options,
		});
		return;
	}

	// Verify ALL subscriptions referenced by cusProducts
	const subIds = customerProductsToStripeSubscriptionIds({
		customerProducts: cusProducts,
	}).filter(notNullish);

	if (options?.debug) {
		console.log(`\nFound ${subIds.length} subscription(s) to verify:`, subIds);
	}

	expect(
		subIds.length,
		"Expected at least one subscription ID on customer products",
	).toBeGreaterThan(0);

	for (const subId of subIds) {
		await verifySubscription({
			ctx,
			subId,
			cusProducts,
			options,
		});
	}
};
