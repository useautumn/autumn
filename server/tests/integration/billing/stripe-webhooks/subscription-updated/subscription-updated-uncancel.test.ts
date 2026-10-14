import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("sub.updated: uncancel via Stripe CLI (cancel_at_period_end: false)")}`, async () => {
	const customerId = "sub-updated-uncancel-basic";

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

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update(
		{
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		},
		{
			timeout: 5000,
		},
	);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at: null,
	});

	await timeout(10000);

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	const productsInGroup = customerAfterUncancel.products.filter(
		(p) => p.group === pro.group,
	);
	expect(productsInGroup.length).toBe(1);
	expect(productsInGroup[0].id).toBe(pro.id);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("sub.updated: uncancel pro with add-on via Stripe CLI")}`, async () => {
	const customerId = "sub-updated-uncancel-addon";

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

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id, addon.id],
	});

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await timeout(10000);
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await timeout(10000);

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
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: false,
	});

	await timeout(10000);

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUncancel,
		active: [pro.id, addon.id],
		notPresent: [free.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("sub.updated: cancel pro then uncancel pro via Stripe CLI")}`, async () => {
	const customerId = "sub-updated-cancel-uncancel-cli";

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

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await timeout(5000);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: false,
	});

	await timeout(5000);

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	const productsInGroup = customerAfterUncancel.products.filter(
		(p) => p.group === pro.group,
	);
	expect(productsInGroup.length).toBe(1);
	expect(productsInGroup[0].id).toBe(pro.id);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
