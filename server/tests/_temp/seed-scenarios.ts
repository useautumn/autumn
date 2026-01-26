#!/usr/bin/env bun

/**
 * Seed script for manual dashboard testing of cancel scenarios.
 *
 * Creates:
 * A. Pro product with consumable words, allocated workflows, and prepaid messages
 * B. Recurring add-on
 * C. Free product with free messages
 * D. One-time plan with prepaid messages
 * E. Premium product (same as pro but with higher prices)
 * F. Customer with 2 entity users
 *
 * Run: bun server/tests/_temp/seed-scenarios.ts
 */

import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { createTestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const SEED_PREFIX = "seed-cancel-test";

async function seedScenarios() {
	// Clear and setup org first

	// await clearMasterOrg();

	const ctx = await createTestContext();

	// ═══════════════════════════════════════════════════════════════════
	// PRODUCT DEFINITIONS
	// ═══════════════════════════════════════════════════════════════════

	// A. Pro product with consumable words, allocated workflows, and prepaid messages
	const proProduct = products.pro({
		id: "pro",
		items: [
			items.consumableWords({ includedUsage: 100 }), // 100 free words, then $0.05/word overage
			items.allocatedWorkflows({ includedUsage: 3 }), // 3 free workflows, $10/workflow overage
			items.prepaidMessages({
				includedUsage: 50,
				billingUnits: 100,
				price: 10,
			}), // 50 free messages, $10/100 pack
		],
	});

	// B. Recurring add-on ($20/month with extra messages)
	const recurringAddOn = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 500 })], // 500 extra messages per month
	});

	// C. Free product with free messages
	const freeProduct = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })], // 100 free messages/month
		isDefault: true,
	});

	// D. One-time plan with prepaid messages
	const oneTimeProduct = products.oneOff({
		id: "one-time",
		items: [
			items.oneOffMessages({ includedUsage: 0, billingUnits: 500, price: 25 }),
		], // $25 for 500 messages (one-time)
	});

	// E. Premium product (same features as pro but with premium pricing)
	const premiumProduct = products.base({
		id: "premium",
		items: [
			items.monthlyPrice({ price: 50 }), // $50/month base (vs pro's $20)
			items.consumableWords({ includedUsage: 500 }), // 500 free words (vs pro's 100)
			items.allocatedWorkflows({ includedUsage: 10 }), // 10 free workflows (vs pro's 3)
			items.prepaidMessages({
				includedUsage: 200,
				billingUnits: 100,
				price: 8,
			}), // 200 free messages, $8/100 pack
		],
	});

	const allProducts = [
		proProduct,
		recurringAddOn,
		freeProduct,
		oneTimeProduct,
		premiumProduct,
	];

	// ═══════════════════════════════════════════════════════════════════
	// INITIALIZE SCENARIO
	// ═══════════════════════════════════════════════════════════════════

	await initScenario({
		ctx,
		customerId: SEED_PREFIX,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: allProducts }),
			s.entities({ count: 2, featureId: TestFeature.Users }), // F. 2 entity users
		],
		actions: [
			// Attach the pro product to the customer
			s.attach({
				productId: proProduct.id,
				options: [{ feature_id: "messages", quantity: 100 }],
			}),
			s.attach({
				productId: recurringAddOn.id,
			}),

			s.attach({
				productId: premiumProduct.id,
				entityIndex: 0,
				options: [{ feature_id: "messages", quantity: 300 }],
			}),
		],
	});

	process.exit(0);
}

seedScenarios()
	.catch((error) => {
		console.error("Seed script failed:", error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
