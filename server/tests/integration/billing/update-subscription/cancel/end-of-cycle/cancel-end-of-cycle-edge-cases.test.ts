import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

test.concurrent(`${chalk.yellowBright("cancel EOC edge: cancel both pro and addon (separate subs) - correct subs canceled")}`, async () => {
	const customerId = "cancel-eoc-both-separate-subs";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id, newBillingSubscription: true }),
		],
	});

	const proSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	const addonSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: addon.id,
	});

	expect(proSubId).not.toBe(addonSubId);

	const proSubBefore = await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubBefore = await ctx.stripeCli.subscriptions.retrieve(addonSubId);

	expect(isStripeSubscriptionCanceling(proSubBefore)).toBe(false);
	expect(isStripeSubscriptionCanceling(addonSubBefore)).toBe(false);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const proSubAfterProCancel =
		await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubAfterProCancel =
		await ctx.stripeCli.subscriptions.retrieve(addonSubId);

	expect(isStripeSubscriptionCanceling(proSubAfterProCancel)).toBe(true);
	expect(isStripeSubscriptionCanceling(addonSubAfterProCancel)).toBe(false);

	const customerAfterProCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterProCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterProCancel,
		productId: addon.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const proSubAfterBothCancel =
		await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubAfterBothCancel =
		await ctx.stripeCli.subscriptions.retrieve(addonSubId);

	expect(isStripeSubscriptionCanceling(proSubAfterBothCancel)).toBe(true);
	expect(isStripeSubscriptionCanceling(addonSubAfterBothCancel)).toBe(true);

	const customerAfterBothCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterBothCancel,
		canceling: [pro.id, addon.id],
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: addon.id,
	});

	expect(customerAfterAdvance.products.length).toBe(0);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel EOC edge: entity cancel -> uncancel -> cancel again")}`, async () => {
	const customerId = "cancel-eoc-uncancel-cancel-again";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: "users" }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const entity1Initial = await autumnV1.entities.get(customerId, entity1Id);
	const entity2Initial = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({ customer: entity1Initial, productId: pro.id });
	await expectProductActive({ customer: entity2Initial, productId: pro.id });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const entity1AfterSecondCancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterSecondCancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductCanceling({
		customer: entity1AfterSecondCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterSecondCancel,
		productId: pro.id,
	});
});

test.concurrent(`${chalk.yellowBright("cancel EOC edge: pro with empty group - free default NOT scheduled")}`, async () => {
	const customerId = "cancel-eoc-empty-group-no-default";

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
	pro.group = "";

	const { autumnV1, ctx, testClockId } = await initScenario({
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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [pro.id],
		notPresent: [free.id],
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: free.id,
	});

	expect(customerAfterAdvance.products.length).toBe(0);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
