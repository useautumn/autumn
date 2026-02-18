import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Tests for legacy V1 API balance updates.
 * These test the deprecated customers.setBalance API for backwards compatibility.
 */

// =============================================================================
// Test: legacy-update-balance1 - V1 API setBalance for entity
// =============================================================================
test.concurrent(`${chalk.yellowBright("legacy-update-balance1: V1 API setBalance for entity")}`, async () => {
	const creditsItem = items.monthlyCredits({ includedUsage: 500 });
	const pro = products.pro({ id: "pro", items: [creditsItem] });

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "legacy-update-balance1",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Credits }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
		],
	});

	const entityId = entities[0].id;

	// Use legacy V1 API to set balance
	await autumnV1.customers.setBalance({
		customerId: customerId,
		entityId: entityId,
		balances: [
			{
				feature_id: TestFeature.Credits,
				balance: 100,
			},
		],
	});

	// Verify via V1 API
	const entity = await autumnV1.entities.get(customerId, entityId);
	expect(entity.features.credits.balance).toBe(100);
});
