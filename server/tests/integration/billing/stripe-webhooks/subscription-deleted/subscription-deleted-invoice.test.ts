import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import {
	getEntitySubscriptionId,
	getSubscriptionId,
} from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { waitForCustomerProductExpired } from "@tests/integration/billing/utils/waitForCustomerProductExpired";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: customer consumable → Stripe cancel immediately → no final invoice")}`, async () => {
	const customerId = "sub-del-inv-cus-imm";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
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
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	await waitForCustomerProductExpired({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		stripeSubscriptionId: subscriptionId,
	});

	await expectProductNotPresent({
		autumn: autumnV1,
		customerId,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: entity consumable → Stripe cancel immediately → no final invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-imm";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	await waitForCustomerProductExpired({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		stripeSubscriptionId: subscriptionId,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: multi-interval → advance 1 month → Stripe cancel immediately → no invoice")}`, async () => {
	const customerId = "sub-del-inv-multi-int";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const annualPriceItem = items.annualPrice({ price: 120 });

	const pro = products.base({
		id: "pro",
		items: [consumableItem, annualPriceItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 120,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountAfterAdvance = customerAfterAdvance.invoices?.length ?? 0;

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	await waitForCustomerProductExpired({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		stripeSubscriptionId: subscriptionId,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customerAfterCancel.invoices?.length).toBe(invoiceCountAfterAdvance);
});

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: entity consumable → advance 1 month → Stripe cancel immediately → no invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-adv";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	const customerBeforeCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBeforeCancel = customerBeforeCancel.invoices?.length ?? 0;

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	await waitForCustomerProductExpired({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		stripeSubscriptionId: subscriptionId,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterCancel.invoices?.length).toBe(invoiceCountBeforeCancel);
});

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: customer trial consumable → cancel at period end → NO arrear invoice")}`, async () => {
	const customerId = "sub-del-inv-cus-trial";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 14,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
		latestInvoiceProductId: proTrial.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 250,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-150);

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: proTrial.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);
	expect(subAfterSchedule.status).toBe("trialing");

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 0,
		latestInvoiceProductId: proTrial.id,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: entity trial consumable → cancel at period end → NO arrear invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-trial";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 14,
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: proTrial.id,
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 0,
		latestInvoiceProductId: proTrial.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: proTrial.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);
	expect(subAfterSchedule.status).toBe("trialing");

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: proTrial.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 0,
		latestInvoiceProductId: proTrial.id,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted invoice: entity consumable → Stripe cancel at period end → CREATES arrear invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-eop";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);
	expect(subAfterSchedule.status).toBe("active");

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		count: 2,
		latestTotal: 40,
	});
});
