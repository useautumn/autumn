import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel immediately: free product")}`, async () => {
	const customerId = "cancel-imm-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [free.id],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [free.id],
	});
	expect(customerAfterCancel.products.length).toBe(0);
});

test.concurrent(`${chalk.yellowBright("cancel immediately: default free product")}`, async () => {
	const customerId = "cancel-imm-default-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [free.id],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [free.id],
	});
	expect(customerAfterCancel.products.length).toBe(0);
});

test.concurrent(`${chalk.yellowBright("cancel immediately: pro with default free")}`, async () => {
	const customerId = "cancel-imm-pro-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(-20);
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id],
		active: [free.id],
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately: pro without default")}`, async () => {
	const customerId = "cancel-imm-pro-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(-20);
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id],
	});
	expect(customerAfterCancel.products.length).toBe(0);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately: downgrade then cancel (no default)")}`, async () => {
	const customerId = "cancel-imm-downgrade-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 50,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(-50);
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [premium.id, pro.id],
	});

	expect(customerAfterCancel.products.length).toBe(0);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately: downgrade then cancel (with default)")}`, async () => {
	const customerId = "cancel-imm-downgrade-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 50,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(-50);
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [premium.id, pro.id],
		active: [free.id],
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately: multi-interval product")}`, async () => {
	const customerId = "cancel-imm-multi-interval";

	const prepaidMessagesItem = items.prepaidMessages({ includedUsage: 0 });
	const annualPriceItem = items.annualPrice({ price: 200 });

	const pro = products.base({
		id: "pro",
		items: [prepaidMessagesItem, annualPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 210,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(-210);
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id],
	});
	expect(customerAfterCancel.products.length).toBe(0);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately: one-off prepaid product")}`, async () => {
	const customerId = "cancel-imm-oneoff";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOffProduct = products.base({
		id: "oneoff",
		items: [oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: "messages", quantity: 200 }],
			}),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [oneOffProduct.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [oneOffProduct.id],
	});
	expect(customerAfterCancel.products.length).toBe(0);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately: one-off product does not create free default")}`, async () => {
	const customerId = "cancel-imm-oneoff-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOffProduct = products.base({
		id: "oneoff",
		items: [oneOffMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, oneOffProduct] }),
		],
		actions: [
			s.attach({
				productId: oneOffProduct.id,
				options: [{ feature_id: "messages", quantity: 200 }],
			}),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [oneOffProduct.id],
		notPresent: [free.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: oneOffProduct.id,
		cancel_action: "cancel_immediately" as const,
	};
	await autumnV1.subscriptions.update(cancelParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [oneOffProduct.id, free.id],
	});

	expect(customerAfterCancel.products.length).toBe(0);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
