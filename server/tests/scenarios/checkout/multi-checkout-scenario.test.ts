import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Multi-Checkout Scenario
 *
 * Tests attaching multiple products with Autumn checkout URLs.
 * Uses billing.attach with redirect_mode: "always" for each product
 * to get Autumn checkout URLs (not Stripe).
 */

test(`${chalk.yellowBright("checkout: multi - multiple products with autumn checkout")}`, async () => {
	const customerId = "checkout-multi";

	// Main subscription product ($49/mo) with features
	const proSubscription = products.base({
		id: "pro-subscription",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 100 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	// Credit pack add-on ($15/mo for 1000 extra messages)
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

	// Team seats add-on ($25/mo + $10/seat)
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

	// Options for prepaid features
	const creditOptions = [{ feature_id: TestFeature.Messages, quantity: 1000 }];
	const seatsOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	// 1. Preview attach for main subscription
	const proPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro-subscription_${customerId}`,
	});
	console.log("pro preview:", proPreview);

	// 2. Preview attach for credit pack
	const creditPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `credit-pack_${customerId}`,
		options: creditOptions,
	});
	console.log("credit pack preview:", creditPreview);

	// 3. Preview attach for team seats
	const seatsPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `team-seats_${customerId}`,
		options: seatsOptions,
	});
	console.log("team seats preview:", seatsPreview);

	// 4. Attach main subscription with redirect_mode: "always" (Autumn checkout URL)
	const proResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro-subscription_${customerId}`,
		redirect_mode: "always",
	});
	console.log("pro subscription result:", proResult);

	// 5. Attach credit pack add-on with redirect_mode: "always"
	const creditResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `credit-pack_${customerId}`,
		redirect_mode: "always",
		options: creditOptions,
	});
	console.log("credit pack result:", creditResult);

	// 6. Attach team seats add-on with redirect_mode: "always"
	const seatsResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `team-seats_${customerId}`,
		redirect_mode: "always",
		options: seatsOptions,
	});
	console.log("team seats result:", seatsResult);
});
