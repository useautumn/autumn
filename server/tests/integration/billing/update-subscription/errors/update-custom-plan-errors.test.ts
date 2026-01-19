import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM PLAN ERRORS - Same Configuration
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Cannot update with same items (free product)
test.concurrent(`${chalk.yellowBright("error: custom plan same config (free)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-custom-same-free",
		setup: [s.customer({}), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: "base" })],
	});

	// Try to update with identical items - should fail
	const updateParams = {
		customer_id: customerId,
		product_id: freeProd.id,
		items: [messagesItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 2. Cannot update with same items (paid product)
test.concurrent(`${chalk.yellowBright("error: custom plan same config (paid)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-custom-same-paid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Try to update with identical items - should fail
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, priceItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});

// 3. Cannot update with same items (multiple features)
test.concurrent(`${chalk.yellowBright("error: custom plan same config (multi-feature)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });
	const prod = products.base({
		items: [messagesItem, creditsItem],
		id: "multi-feature",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "err-custom-same-multi",
		setup: [s.customer({}), s.products({ list: [prod] })],
		actions: [s.attach({ productId: "multi-feature" })],
	});

	// Try to update with identical items - should fail
	const updateParams = {
		customer_id: customerId,
		product_id: prod.id,
		items: [messagesItem, creditsItem],
	};

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update(updateParams);
		},
	});
});
