import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	FreeTrialDuration,
	freeTrials,
	ms,
} from "@autumn/shared";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";

/**
 * Miscellaneous trial update tests
 *
 * Tests for edge cases and specific behaviors around trial updates.
 */

// Test that passing free_trial param does NOT create a new free trial record for the original product
test.concurrent(`${chalk.yellowBright("trial-misc: update subscription free_trial param does not override product default trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Create a product with a default 7-day trial
	const proFreeTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-free-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-misc-no-override",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proFreeTrial] }),
		],
		actions: [s.attach({ productId: proFreeTrial.id })],
	});

	// Verify product is trialing with 7-day trial
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proFreeTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Get the full product to access internal_id
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: proFreeTrial.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	// Verify initial free trial count for this product
	const initialFreeTrials = await ctx.db.query.freeTrials.findMany({
		where: eq(freeTrials.internal_product_id, fullProduct.internal_id),
	});
	expect(initialFreeTrials.length).toBe(1);
	expect(initialFreeTrials[0].is_custom).toBe(false);

	// Update subscription with a DIFFERENT free_trial param (14 days)
	// This should NOT create a new free trial record for the original product
	const updateParams = {
		customer_id: customerId,
		product_id: proFreeTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	await autumnV1.subscriptions.update(updateParams);

	// Verify customer is now trialing with 14-day trial
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerAfter,
		productId: proFreeTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Query DB to verify only 1 free trial exists for the original product's internal_id
	// The custom free_trial param should NOT be persisted against the product's internal_id
	const finalFreeTrials = await ctx.db.query.freeTrials.findMany({
		where: eq(freeTrials.internal_product_id, fullProduct.internal_id),
	});

	// Should still be only 1 free trial (the original product's default trial)
	// The custom 14-day trial should not create a new record linked to this product
	const nonCustomFreeTrials = finalFreeTrials.filter(
		(ft) => ft.is_custom === false,
	);
	expect(nonCustomFreeTrials.length).toBe(1);
	expect(nonCustomFreeTrials[0].length).toBe(7); // Original 7-day trial unchanged

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
