import { expect, test } from "bun:test";
import { type ApiCustomerV3, RolloverExpiryDurationType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// TRACK-ROLLOVER8: Messages with rollover, reset creates rollover,
// track with skip_cache to verify Postgres deduction path
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("track-rollover8: messages with rollover, track with skip_cache verifies Postgres deduction")}`, async () => {
	const rolloverConfig = {
		max: 200,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const messagesItem = items.monthlyMessagesWithRollover({
		includedUsage: 500,
		rolloverConfig,
	});

	const freeProd = products.base({
		id: "free",
		items: [messagesItem],
	});

	const customerId = "track-rollover8";

	// Setup: create customer, attach free product, then reset to create rollover
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.resetFeature({ featureId: TestFeature.Messages }),
		],
	});

	// After reset: 500 included + rollover (capped at max 200) = 700
	const customerAfterReset =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const messagesAfterReset = customerAfterReset.features[TestFeature.Messages];

	expect(messagesAfterReset?.balance).toBe(700);
	expect(messagesAfterReset?.rollovers?.[0].balance).toBe(200);

	// Wait for sync to Postgres before skip_cache track
	await timeout(2000);

	// Track 50 messages with skip_cache (forces Postgres path)
	// Should deduct from rollover first: 200 - 50 = 150
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		},
		{ skipCache: true },
	);

	// Wait for sync

	// Verify with skip_cache to get Postgres state
	const customerAfterTrack1 = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	const messagesAfterTrack1 =
		customerAfterTrack1.features[TestFeature.Messages];

	// Rollover: 200 - 50 = 150
	// Total: 500 + 150 = 650
	expect(messagesAfterTrack1?.rollovers?.[0].balance).toBe(150);
	expect(messagesAfterTrack1?.balance).toBe(650);

	// Track 200 more with skip_cache
	// Should deplete rollover (150) and take 50 from included
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		},
		{ skipCache: true },
	);

	const customerAfterTrack2 = await autumnV1.customers.get<ApiCustomerV3>(
		customerId,
		{ skip_cache: "true" },
	);
	const messagesAfterTrack2 =
		customerAfterTrack2.features[TestFeature.Messages];

	// Rollover depleted: 0
	// Included: 500 - 50 = 450
	// Total: 450
	expect(messagesAfterTrack2?.rollovers?.[0].balance).toBe(0);
	expect(messagesAfterTrack2?.balance).toBe(450);
});
