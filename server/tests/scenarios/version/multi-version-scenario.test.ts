import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Multi-Version Scenario
 *
 * Creates a product with multiple versions (v1, v2, v3) BEFORE
 * a customer attaches. Customer gets latest version by default.
 *
 * Setup:
 * - v1: $20/month, 100 messages
 * - v2: $30/month, 100 messages
 * - v3: $40/month, 100 messages
 * - Customer attaches after all versions exist
 */

test(`${chalk.yellowBright("version-scenario: multi-version setup")}`, async () => {
	const customerId = "version-scenario-multi";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItemV1],
	});

	// Initialize scenario with product but NO attach action yet
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $30 price
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});
});
