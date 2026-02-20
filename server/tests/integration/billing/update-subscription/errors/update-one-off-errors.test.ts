import { test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCustomerFeatureCorrect } from "../../utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "../../utils/expectCustomerInvoiceCorrect";

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF ERRORS - Price/Billing Changes Not Allowed
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Error: changing base price on one-off product
test.concurrent(`${chalk.yellowBright("error: one-off changing base price")}`, async () => {
	const oneOffPriceItem = items.oneOffPrice({ price: 50 });
	const oneOffProd = products.base({ items: [oneOffPriceItem], id: "oneoff" });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-base-price",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [s.attach({ productId: "oneoff" })],
	});

	// Try to change base price - should fail
	const newPriceItem = items.oneOffPrice({ price: 100 });
	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProd.id,
		items: [newPriceItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 2. Error: changing feature price on one-off prepaid product
test.concurrent(`${chalk.yellowBright("error: one-off changing feature price")}`, async () => {
	const oneOffMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits: 100,
	});
	const oneOffProd = products.base({
		items: [oneOffMessagesItem],
		id: "oneoff-feature",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-feature-price",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: "oneoff-feature",
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	// Try to change feature price - should fail
	const newMessagesItem = items.oneOffMessages({
		price: 20,
		billingUnits: 100,
	});
	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProd.id,
		items: [newMessagesItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 3. Error: changing billing units on one-off prepaid product
test.concurrent(`${chalk.yellowBright("error: one-off changing billing units")}`, async () => {
	const oneOffMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits: 100,
	});
	const oneOffProd = products.base({
		items: [oneOffMessagesItem],
		id: "oneoff-billing",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-billing-units",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: "oneoff-billing",
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	// Try to change billing units - should fail
	const newMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits: 200,
	});
	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProd.id,
		items: [newMessagesItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 4. Error: changing both price and billing units on one-off
test.concurrent(`${chalk.yellowBright("error: one-off changing price and billing units")}`, async () => {
	const oneOffMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits: 100,
	});
	const oneOffProd = products.base({
		items: [oneOffMessagesItem],
		id: "oneoff-both",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-both",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [
			s.attach({
				productId: "oneoff-both",
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	// Try to change both price and billing units - should fail
	const newMessagesItem = items.oneOffMessages({
		price: 20,
		billingUnits: 200,
	});
	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProd.id,
		items: [newMessagesItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 5. Error: updating quantity of one-off item on recurring product
test.concurrent(`${chalk.yellowBright("error: one-off item quantity update on recurring product")}`, async () => {
	const billingUnits = 100;
	const oneOffMessagesItem = items.oneOffMessages({
		price: 10,
		billingUnits,
	});
	const recurringProduct = products.base({
		items: [items.monthlyPrice({ price: 20 }), oneOffMessagesItem],
		id: "recurring-with-oneoff",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-qty-recurring",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [recurringProduct] }),
		],
		actions: [
			s.attach({
				productId: recurringProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 1 * billingUnits },
				],
			}),
		],
	});

	// Try to update quantity of one-off messages - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: recurringProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 2 * billingUnits },
				],
			});
		},
	});
});

// 6. Error: adding a free trial to a one-off product
test.concurrent(`${chalk.yellowBright("error: one-off adding free trial")}`, async () => {
	const oneOffPriceItem = items.oneOffPrice({ price: 50 });
	const oneOffProd = products.base({
		items: [oneOffPriceItem],
		id: "oneoff-add-trial",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-add-trial",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProd] }),
		],
		actions: [s.attach({ productId: "oneoff-add-trial" })],
	});

	// Try to add a free trial to a one-off product - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: oneOffProd.id,
				free_trial: {
					length: 7,
					duration: FreeTrialDuration.Day,
					card_required: true,
				},
			});
		},
	});
});

// 8. Error: removing trial and adding one-off item
test.concurrent(`${chalk.yellowBright("error: remove trial and add one-off item")}`, async () => {
	const dashboardItem = items.dashboard();
	const monthlyBasePrice = items.monthlyPrice({ price: 20 });

	const proTrial = products.base({
		items: [dashboardItem, monthlyBasePrice],
		id: "pro-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-trial-remove-add-oneoff",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Try to remove trial and add one-off prepaid messages - should fail
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const quantity = 300;

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: proTrial.id,
				free_trial: null,
				items: [dashboardItem, monthlyBasePrice, oneOffMessagesItem],
				options: [{ feature_id: TestFeature.Messages, quantity }],
			});
		},
	});
});

// Update prepaid item included usage on one-off product
test.concurrent(`${chalk.yellowBright("one-off: update prepaid item included usage")}`, async () => {
	const billingUnits = 100;
	const price = 10;
	const oldIncludedUsage = 50;
	const prepaidItem = items.oneOffMessages({
		includedUsage: oldIncludedUsage,
		billingUnits,
		price,
	});
	const oneOffProduct = products.base({
		items: [prepaidItem],
		id: "one-off-prepaid-included",
	});

	const quantity = 200; // 2 packs

	const { customerId, autumnV1 } = await initScenario({
		customerId: "one-off-prepaid-included",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: TestFeature.Messages, quantity }],
				timeout: 4000,
			}),
		],
	});

	// Track some usage
	const messagesUsed = 100;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	// Update included usage from 50 to 100 (same quantity)
	const newTotalGranted = 300;
	const newIncludedUsage = 100;
	const updatedPrepaidItem = items.oneOffMessages({
		includedUsage: newIncludedUsage,
		billingUnits,
		price,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		items: [updatedPrepaidItem],
	};

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: newTotalGranted,
		balance: newTotalGranted - messagesUsed,
		usage: messagesUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});

	// await expectAutumnError({
	// 	func: async () => {
	// 		await autumnV1.subscriptions.update(updateParams);
	// 	},
	// });
});
