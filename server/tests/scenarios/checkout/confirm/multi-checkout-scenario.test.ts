import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("checkout: multi - multiple products with autumn checkout")}`, async () => {
	const customerId = "checkout-multi";

	const proSubscription = products.base({
		id: "pro-subscription",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 100 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const creditPack = products.base({
		id: "credit-pack",
		isAddOn: true,
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 1000,
				price: 15,
			}),
		],
	});

	const teamSeats = products.base({
		id: "team-seats",
		isAddOn: true,
		items: [
			items.prepaidUsers({ includedUsage: 3, billingUnits: 1 }),
			items.monthlyPrice({ price: 25 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proSubscription, creditPack, teamSeats] }),
		],
		actions: [],
	});

	const creditOptions = [{ feature_id: TestFeature.Messages, quantity: 1000 }];
	const seatsOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	const proPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro-subscription_${customerId}`,
	});
	console.log("pro preview:", proPreview);

	const creditPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `credit-pack_${customerId}`,
		options: creditOptions,
	});
	console.log("credit pack preview:", creditPreview);

	const seatsPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `team-seats_${customerId}`,
		options: seatsOptions,
	});
	console.log("team seats preview:", seatsPreview);

	const proResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro-subscription_${customerId}`,
		redirect_mode: "always",
	});
	console.log("pro subscription result:", proResult);

	const creditResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `credit-pack_${customerId}`,
		redirect_mode: "always",
		options: creditOptions,
	});
	console.log("credit pack result:", creditResult);

	const seatsResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `team-seats_${customerId}`,
		redirect_mode: "always",
		options: seatsOptions,
	});
	console.log("team seats result:", seatsResult);
});
