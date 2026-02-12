import { expect, test } from "bun:test";
import { type ApiCustomerV3, RolloverExpiryDurationType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// TRACK-ROLLOVER7: Free product with credits, reset creates rollover,
// then track Action1/Action2 deducts from rollover balance first
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-rollover7: free product with credits rollover, track actions deduct from rollover first")}`, async () => {
	const rolloverConfig = {
		max: 300,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const creditsItem = items.monthlyCredits({
		includedUsage: 500,
		rolloverConfig,
	});

	const freeProd = products.base({
		id: "free",
		items: [creditsItem],
	});

	const customerId = "track-rollover7";

	// Setup: create customer, attach free product, then reset to create rollover
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.resetFeature({ featureId: TestFeature.Credits }),
		],
	});

	// After reset: 500 included + 500 rollover (capped at max 300) = 800
	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterReset = customerAfterReset.features[TestFeature.Credits];

	expect(creditsAfterReset?.balance).toBe(800);
	expect(creditsAfterReset?.rollovers?.[0].balance).toBe(300);

	// Track Action1 (credit_cost: 0.2) with value 100
	// Credits deducted = 100 * 0.2 = 20, should come from rollover first
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 100,
	});

	const customerAfterAction1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterAction1 =
		customerAfterAction1.features[TestFeature.Credits];

	// Rollover was 300, after deducting 100 * credit cost, rollover = 280
	// Total balance = 500 + 280 = 780
	expect(creditsAfterAction1?.rollovers?.[0].balance).toBe(280);
	expect(creditsAfterAction1?.balance).toBe(780);

	// Track Action2 (credit_cost: 0.6) with value 400
	// Credits deducted = 400 * 0.6 = 240, should come from rollover first
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action2,
		value: 400,
	});

	await timeout(3000);

	const customerAfterAction2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterAction2 =
		customerAfterAction2.features[TestFeature.Credits];

	// Rollover was 280, deduct 240 → rollover = 40
	// Total balance = 500 + 40 = 540
	// @ts-expect-error (rollovers is array)
	expect(creditsAfterAction2?.rollovers[0].balance).toBe(40);
	expect(creditsAfterAction2?.balance).toBe(540);

	// Track Action1 with value 500 → 500 * 0.2 = 100 credits
	// Rollover has 40, so 40 from rollover, 60 from included
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Action1,
		value: 500,
	});

	await timeout(3000);

	const customerAfterAction3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const creditsAfterAction3 =
		customerAfterAction3.features[TestFeature.Credits];

	// Rollover depleted (0), included = 500 - 60 = 440
	// Total balance = 440
	// @ts-expect-error (rollovers is array)
	expect(creditsAfterAction3?.rollovers[0].balance).toBe(0);
	expect(creditsAfterAction3?.balance).toBe(440);

	// Verify non-cached
	await timeout(2000);
	const nonCached = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	// @ts-expect-error
	expect(nonCached.features[TestFeature.Credits]?.rollovers[0].balance).toBe(0);
	expect(nonCached.features[TestFeature.Credits]?.balance).toBe(440);
});
