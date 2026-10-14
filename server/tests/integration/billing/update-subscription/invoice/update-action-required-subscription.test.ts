import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeInvoiceConfirmationV2 as completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmationV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("subscription-create: no payment method")}`, async () => {
	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const freePlan = products.base({
		id: "free",
		items: [freeMessages],
		isDefault: true,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "sub-create-no-pm",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freePlan] }),
		],
		actions: [
			s.attach({ productId: freePlan.id }),
			s.removePaymentMethod(),
		],
	});

	const paidMessages = items.monthlyMessages({ includedUsage: 200 });
	const paidPrice = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: freePlan.id,
		items: [paidMessages, paidPrice],
	};

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_method_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 50,
	});

	await completeInvoiceCheckout({
		url: result.payment_url!,
		ctx,
		customerId,
	});

	const customerAfterCheckout =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterCheckout,
		productId: freePlan.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterCheckout,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCheckout,
		count: 1,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("subscription-create: 3ds authentication required")}`, async () => {
	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const freePlan = products.base({
		id: "free",
		items: [freeMessages],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "sub-create-3ds",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freePlan] }),
		],
		actions: [
			s.attach({ productId: freePlan.id }),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	const paidMessages = items.monthlyMessages({ includedUsage: 200 });
	const paidPrice = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: freePlan.id,
		items: [paidMessages, paidPrice],
	};

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 50,
	});

	await completeInvoiceConfirmation({
		url: result.payment_url!,
	});

	const customerAfterAuth =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterAuth,
		productId: freePlan.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterAuth,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAuth,
		count: 1,
		latestStatus: "paid",
	});
});

test.concurrent(`${chalk.yellowBright("subscription-create: payment failed")}`, async () => {
	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const freePlan = products.base({
		id: "free",
		items: [freeMessages],
		isDefault: true,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "sub-create-fail",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freePlan] }),
		],
		actions: [
			s.attach({ productId: freePlan.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const paidMessages = items.monthlyMessages({ includedUsage: 200 });
	const paidPrice = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: freePlan.id,
		items: [paidMessages, paidPrice],
	};

	const result = await autumnV1.subscriptions.update(updateParams);

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("payment_failed");
	expect(result.payment_url).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 50,
	});
});
