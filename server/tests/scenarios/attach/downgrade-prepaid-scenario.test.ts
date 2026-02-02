import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Downgrade to Plan with Prepaid Items Scenario
 *
 * Tests downgrading from a premium plan WITHOUT prepaid items to a cheaper plan
 * that HAS prepaid items.
 */

test(`${chalk.yellowBright("attach: downgrade - no prepaid to plan with prepaid items")}`, async () => {
	const customerId = "attach-downgrade-to-prepaid";

	// Enterprise plan ($149/mo) - expensive but NO prepaid items
	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.unlimitedMessages(),
			items.consumableWords({ includedUsage: 1000 }),
			items.monthlyPrice({ price: 149 }),
		],
	});

	// Pro plan ($49/mo) - cheaper with prepaid users
	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.prepaidUsers({ includedUsage: 2, billingUnits: 1 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	// Setup: customer with payment method and enterprise plan (no prepaid) already attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprise, pro] }),
		],
		actions: [s.attach({ productId: "enterprise" })],
	});

	// Options for prepaid features in pro plan
	const proOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	// 1. Preview the downgrade
	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: proOptions,
	});
	console.log("downgrade preview:", downgradePreview);

	// 2. Perform the downgrade
	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
		options: proOptions,
	});
	console.log("downgrade result:", downgradeResult);
});
