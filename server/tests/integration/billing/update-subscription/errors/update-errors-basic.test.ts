import { test } from "bun:test";
import { ErrCode, type UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";

// ═══════════════════════════════════════════════════════════════════════════════
// MISSING UPDATE PARAMS ERROR
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("error: no update params provided")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const base = products.base({ items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "err-no-update-params",
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [s.attach({ productId: "base" })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidInputs,
		func: async () => {
			await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: base.id,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT TYPE TRANSITION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Cannot update from recurring product to one-off product
test.concurrent(`${chalk.yellowBright("error: recurring to one-off transition")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const recurring = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-rec-to-oneoff",
		setup: [s.customer({}), s.products({ list: [recurring] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Try to update to one-off items (price with null interval)
	const oneOffPriceItem = constructPriceItem({
		price: 50,
		interval: null, // One-off
	});

	const updateParams = {
		customer_id: customerId,
		product_id: recurring.id,
		items: [oneOffPriceItem],
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 2. Cannot update from one-off product to recurring product
test.concurrent(`${chalk.yellowBright("error: one-off to recurring transition")}`, async () => {
	// Create a one-off prepaid product
	const oneOffPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		price: 50,
		billingUnits: 100,
		includedUsage: 0,
		isOneOff: true,
	});

	const oneOff = products.base({ items: [oneOffPrepaidItem], id: "oneoff" });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-to-rec",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [
			s.attach({
				productId: "oneoff",
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	// Try to update to recurring items
	const recurringMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOff.id,
		items: [recurringMessagesItem],
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 3. Cannot update from paid recurring (pro) to one-off
test.concurrent(`${chalk.yellowBright("error: paid recurring (pro) to one-off transition")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-pro-to-oneoff",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Try to update to one-off items
	const oneOffPriceItem = constructPriceItem({
		price: 50,
		interval: null, // One-off
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [oneOffPriceItem],
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 4. Cannot update from one-off to paid recurring (with monthly price)
test.concurrent(`${chalk.yellowBright("error: one-off to paid recurring transition")}`, async () => {
	// Create a one-off prepaid product
	const oneOffPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Messages,
		price: 50,
		billingUnits: 100,
		includedUsage: 0,
		isOneOff: true,
	});

	const oneOff = products.base({
		items: [oneOffPrepaidItem],
		id: "oneoff-paid",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-oneoff-to-paid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [
			s.attach({
				productId: "oneoff-paid",
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	// Try to update to paid recurring items (monthly price + feature)
	const monthlyPriceItem = items.monthlyPrice({ price: 20 });
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const updateParams = {
		customer_id: customerId,
		product_id: oneOff.id,
		items: [monthlyPriceItem, messagesItem],
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE MODE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

// 5. Cannot use invoice mode when there's no billing change
test.concurrent(`${chalk.yellowBright("error: invoice mode with no billing change")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-inv-no-billing",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Add boolean feature - no price change
	const adminRightsItem = items.adminRights();

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem, adminRightsItem],
		invoice: true,
		enable_product_immediately: true,
		finalize_invoice: false,
	};

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});
