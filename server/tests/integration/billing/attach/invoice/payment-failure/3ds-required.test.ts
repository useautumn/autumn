/**
 * Attach Payment Failure Tests - 3DS Authentication Required
 *
 * Tests for attach when customer's card requires 3DS authentication.
 * Expected: required_action.code = "3ds_required"
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmation";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PLAN - 3DS Required
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("3ds 1: new plan")}`, async () => {
	const customerId = "attach-fail-new-3ds";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "authenticate" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceConfirmation({ url: result.payment_url! });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestStatus: "paid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPGRADE - 3DS Required
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("3ds 2: upgrade")}`, async () => {
	const customerId = "attach-fail-upgrade-3ds";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await completeInvoiceConfirmation({ url: result.payment_url! });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: premium.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF - 3DS Required
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("3ds 3: one-off")}`, async () => {
	const customerId = "attach-fail-oneoff-3ds";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off-credits",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "authenticate" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceConfirmation({ url: result.payment_url! });

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: oneOff.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestStatus: "paid",
	});
});
