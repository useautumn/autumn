import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE QUANTITY ERRORS (PREPAID PRICES REQUIRE OPTIONS)
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Free product → update with prepaid messages but no options → error
test.concurrent(`${chalk.yellowBright("error: update with prepaid but missing options")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-prepaid-no-opts",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Try to update with prepaid messages item but no options
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		price: 10,
		billingUnits: 100,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [prepaidMessagesItem],
		// Missing options!
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidOptions,
		errMessage: "Missing quantity options for prepaid features",
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 2. Pro with prepaidMessages → update to add prepaidWords but missing options for words
test.concurrent(`${chalk.yellowBright("error: add prepaid feature without options")}`, async () => {
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		price: 10,
		billingUnits: 100,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		items: [priceItem, prepaidMessagesItem],
		id: "pro",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-add-prepaid-no-opts",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Try to add prepaidWords but don't provide options for it
	const prepaidWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		price: 15,
		billingUnits: 100,
		includedUsage: 0,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [priceItem, prepaidMessagesItem, prepaidWordsItem],
		options: [
			{ feature_id: TestFeature.Messages, quantity: 5 }, // Only messages, missing words
		],
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidOptions,
		errMessage: "Missing quantity options for prepaid features",
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 3. Pro with prepaidMessages → update with negative quantity → error (from zod validation)
test.concurrent(`${chalk.yellowBright("error: negative quantity for prepaid feature")}`, async () => {
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		price: 10,
		billingUnits: 100,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		items: [priceItem, prepaidMessagesItem],
		id: "pro-neg",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-negative-qty",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro-neg",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	// Try to update with negative quantity
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [priceItem, prepaidMessagesItem],
		options: [
			{ feature_id: TestFeature.Messages, quantity: -1 }, // Negative quantity
		],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 4. Update quantity for non-existent feature → error
test.concurrent(`${chalk.yellowBright("error: update quantity for non-existent feature")}`, async () => {
	const product = products.base({
		id: "multi_feature",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
		],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-nonexistent-feature",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 10 * 10 }],
			}),
		],
	});

	// Try to update a feature that doesn't exist in the subscription
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: product.id,
				options: [{ feature_id: TestFeature.Users, quantity: 10 * 10 }],
			});
		},
	});
});
