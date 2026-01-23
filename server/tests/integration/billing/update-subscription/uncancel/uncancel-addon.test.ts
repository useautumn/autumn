import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

/**
 * Uncancel Add-on Tests
 *
 * Tests for uncanceling add-on products and multi-subscription scenarios.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Uncancel add-on while main is active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel addon: main active")}`, async () => {
	const customerId = "uncancel-addon-main-active";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			s.updateSubscription({ productId: addon.id, cancel: "end_of_cycle" }),
		],
	});

	// Verify pro is active and addon is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	// Uncancel the addon
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel: null,
	});

	// Verify addon is now active, pro unchanged
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: addon.id,
	});
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Verify balances
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);
	expect(customerAfterUncancel.features?.[TestFeature.Credits]?.balance).toBe(
		50,
	);

	// Verify Stripe subscription is correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Uncancel main while add-on is canceling
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel main: addon canceling")}`, async () => {
	const customerId = "uncancel-main-addon-cancel";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			s.updateSubscription({ productId: pro.id, cancel: "end_of_cycle" }),
			s.updateSubscription({ productId: addon.id, cancel: "end_of_cycle" }),
		],
	});

	// Verify both are canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	// Uncancel only the main product
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: null,
	});

	// Verify main is active, addon still canceling
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterUncancel,
		productId: addon.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Uncancel both main and add-on
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel both: main and addon")}`, async () => {
	const customerId = "uncancel-both";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	const pro = products.pro({ items: [messagesItem] });
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			s.updateSubscription({ productId: pro.id, cancel: "end_of_cycle" }),
			s.updateSubscription({ productId: addon.id, cancel: "end_of_cycle" }),
		],
	});

	// Verify both are canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	// Uncancel both products
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: null,
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel: null,
	});

	// Verify both are active
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: addon.id,
	});

	// Verify balances
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);
	expect(customerAfterUncancel.features?.[TestFeature.Credits]?.balance).toBe(
		50,
	);

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Uncancel product on separate subscription
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel: separate subscriptions")}`, async () => {
	const customerId = "uncancel-separate-subs";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 50 });

	// Main product - monthly billing
	const pro = products.pro({ items: [messagesItem] });

	// Add-on with different billing - will create separate subscription
	const addon = constructProduct({
		id: "addon",
		items: [creditsItem],
		type: "pro",
		isDefault: false,
		isAddOn: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	// Cancel only the addon via subscriptions.update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel: "end_of_cycle",
	});

	// Verify addon is canceling, pro still active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: addon.id,
	});

	// Uncancel the addon
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel: null,
	});

	// Verify both active
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: addon.id,
	});

	// Verify Stripe - main subscription should not have been affected
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
