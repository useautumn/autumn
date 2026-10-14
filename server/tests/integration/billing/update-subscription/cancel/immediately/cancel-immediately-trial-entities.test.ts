import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel trial immediately entity: one entity, other still trialing")}`, async () => {
	const customerId = "cancel-trial-imm-entity-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
	});

	const entity1Before = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer: entity2Before,
		productId: proTrial.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductNotPresent({
		customer: entity2After,
		productId: proTrial.id,
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately entity: both entities, subscription canceled")}`, async () => {
	const customerId = "cancel-trial-imm-entity-2";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductNotPresent({
		customer: entity1After,
		productId: proTrial.id,
	});

	const entity2Mid = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity2Mid,
		productId: proTrial.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductNotPresent({
		customer: entity2After,
		productId: proTrial.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately entity: mixed EOC + immediately on 3 entities")}`, async () => {
	const customerId = "cancel-trial-imm-entity-3";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1 }),
			s.attach({ productId: proTrial.id, entityIndex: 2 }),
		],
	});

	for (let i = 0; i < 3; i++) {
		const entity = await autumnV1.entities.get(customerId, entities[i].id);
		await expectProductTrialing({
			customer: entity,
			productId: proTrial.id,
		});
	}

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const entity3After = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductNotPresent({
		customer: entity3After,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
		shouldBeCanceled: true,
	});
});

test.concurrent(`${chalk.yellowBright("cancel trial immediately entity: cancel then re-attach same entity")}`, async () => {
	const customerId = "cancel-trial-imm-entity-4";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	const entityBefore = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entityBefore,
		productId: proTrial.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		cancel_action: "cancel_immediately",
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const entityAfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: proTrial.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
	});

	const entityAfterReattach = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);

	const product = entityAfterReattach.products.find(
		(p) => p.id === proTrial.id,
	);
	expect(product).toBeDefined();
	expect(product?.status).toBe(CusProductStatus.Active);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.invoices?.length).toBe(2);
	expect(customer.invoices?.[0].total).toBe(20);
});
