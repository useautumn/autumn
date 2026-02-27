import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const PRICE_PER_UNIT = 10;

const INCLUDED_USAGE = 100;

test.concurrent(`${chalk.yellowBright("temp: rest update then rpc inverse update returns product to baseline")}`, async () => {
	const customerId = "prepaid-ent-two-included";
	const quantity1 = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const pro = products.base({
		id: "base-prepaid-ent-inc",
		items: [prepaidItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// Attach to entity 1
	const attach1 = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	});

	console.log("attach1", attach1);
	return;
});
