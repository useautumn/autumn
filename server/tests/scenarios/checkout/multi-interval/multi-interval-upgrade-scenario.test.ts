import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: multi-interval upgrade - monthly pro → annual pro with monthly consumables")}`, async () => {
	const customerId = "multi-interval-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [
			items.dashboard(),
			items.consumableMessages({ includedUsage: 0, price: 0.05 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proAnnual] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "always",
	});
	console.log("upgrade preview:", upgradePreview);

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "always",
	});
	console.log("upgrade result:", upgradeResult);
});
