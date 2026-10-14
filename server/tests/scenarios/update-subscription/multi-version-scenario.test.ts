import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("multi-version: simple v1 → complex v2 with prepaid prices")}`, async () => {
	const customerId = "multi-version-update";

	const messagesItemV1 = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItemV1, priceItemV1],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const priceItemV2 = items.monthlyPrice({ price: 40 });
	const prepaidCreditsV2 = items.prepaid({
		featureId: "credits",
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWordsV2 = items.consumableWords({ includedUsage: 0 });
	const dashboardV2 = items.dashboard();

	await autumnV1.products.update(pro.id, {
		items: [priceItemV2, prepaidCreditsV2, consumableWordsV2, dashboardV2],
	});
});
