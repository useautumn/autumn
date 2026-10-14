import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: multi-interval upgrade - monthly pro → annual pro with monthly consumables")}`, async () => {
	const customerId = "multi-interval-upgrade";

	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [
			items.dashboard(),
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: proAnnual.id, entityIndex: 0 })],
	});

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
		redirect_mode: "always",
	});
	console.log("upgrade result:", upgradeResult);
});
