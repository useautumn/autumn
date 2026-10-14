import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel trial immediately: basic cancel")}`, async () => {
	const customerId = "cancel-trial-imm-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(cancelParams, { timeout: 2000 });

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately: with free default")}`, async () => {
	const customerId = "cancel-trial-imm-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		active: [free.id],
		notPresent: [proTrial.id],
	});

	for (const invoice of customerAfterCancel.invoices ?? []) {
		expect(invoice.total).toBe(0);
	}
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately: re-attach charges full price (no duplicate trial)")}`, async () => {
	const customerId = "cancel-trial-imm-reattach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proTrial.id,
	});

	const customerAfterReattach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const product = customerAfterReattach.products.find(
		(p) => p.id === proTrial.id,
	);
	expect(product).toBeDefined();
	expect(product?.status).toBe(CusProductStatus.Active);

	expectCustomerInvoiceCorrect({
		customer: customerAfterReattach,
		count: 2,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately: with scheduled downgrade, both removed")}`, async () => {
	const customerId = "cancel-trial-imm-scheduled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [s.attach({ productId: premiumTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: premiumTrial.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterDowngrade,
		canceling: [premiumTrial.id],
		scheduled: [pro.id],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premiumTrial.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [premiumTrial.id, pro.id],
	});

	expect(customerAfterCancel.products.length).toBe(0);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately: with consumable usage, no overage charged")}`, async () => {
	const customerId = "cancel-trial-imm-consumable";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 0,
	});
});
