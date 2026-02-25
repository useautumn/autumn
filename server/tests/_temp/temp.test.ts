import { test } from "bun:test";
import {
	FreeTrialDuration,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const customerId = "temp-test";

test.concurrent(`${chalk.yellowBright("temp: rest update then rpc inverse update returns product to baseline")}`, async () => {
	const proProd = products.pro({
		id: "pro",
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});
	const customerId = "temp";

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		actions: [],
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proProd.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});

	console.log(result);

	const updateResult =
		await autumnV2_1.subscriptions.update<UpdateSubscriptionV1Params>({
			customer_id: customerId,
			plan_id: proProd.id,
		});
	console.log(updateResult);
});
