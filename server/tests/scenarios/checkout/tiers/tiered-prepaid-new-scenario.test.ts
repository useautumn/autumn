import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const GRADUATED_TIERS = [
	{ to: 500, amount: 10 },
	{ to: 1000, amount: 5 },
	{ to: "inf" as const, amount: 2.5 },
];

test(`${chalk.yellowBright("tiers: tiered prepaid (graduated) upgrade - starter → pro with 800 messages")}`, async () => {
	const customerId = "tiers-tiered-prepaid-upgrade";

	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.tieredPrepaidMessages({
				includedUsage: 100,
				billingUnits: BILLING_UNITS,
				tiers: GRADUATED_TIERS,
			}),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const starter = products.base({
		id: "starter",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.dashboard(),
			items.adminRights(),
		],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: starter.id, entityIndex: 0 })],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "always",
		entity_id: entities[1].id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 100, adjustable: true },
		],
	});
	console.log("tiered prepaid upgrade result:", result);
});
