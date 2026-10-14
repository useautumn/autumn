import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel immediately consumable: customer - track overage → cancel immediately (no charges)")}`, async () => {
	const customerId = "cancel-imm-cons-cus";

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
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	expect(customerAfterCancel.invoices?.length).toBe(2);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately consumable: entity - track overage → cancel immediately (no charges)")}`, async () => {
	const customerId = "cancel-imm-cons-ent";

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

	await autumnV1.track(
		{
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 500,
		},
		{
			timeout: 4000,
		},
	);

	const cancelParams = {
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	expect(preview.total).toBe(-20);

	await autumnV1.subscriptions.update(cancelParams);

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

	expect(customerAfterCancel.invoices?.length).toBe(2);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately consumable: two entities, cancel one, keep one active")}`, async () => {
	const customerId = "cancel-imm-cons-2ent-1cancel";

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
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 2,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity1Id,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity2Id,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductNotPresent({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 3,
		latestTotal: -20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("cancel immediately consumable: entity - within included usage → cancel")}`, async () => {
	const customerId = "cancel-imm-cons-no-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, entities } = await initScenario({
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

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(50);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	if (customerAfterCancel.invoices && customerAfterCancel.invoices.length > 1) {
		const finalInvoice = customerAfterCancel.invoices[0];
		expect(finalInvoice.total).toBeLessThanOrEqual(0);
	}
});
