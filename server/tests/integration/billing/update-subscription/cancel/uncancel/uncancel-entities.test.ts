import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("uncancel entity: other entity active")}`, async () => {
	const customerId = "uncancel-entity-other-active";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });

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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel_action: "cancel_end_of_cycle",
	});

	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
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
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel_action: "uncancel",
	});

	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: pro.id,
	});

	expect(entity1AfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);
	expect(entity2AfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel: all entities")}`, async () => {
	const customerId = "uncancel-all-entities";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });

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

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel_action: "cancel_end_of_cycle",
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		cancel_action: "cancel_end_of_cycle",
	});

	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel_action: "uncancel",
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		cancel_action: "uncancel",
	});

	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel entity: no scheduled default for entities")}`, async () => {
	const customerId = "uncancel-entity-no-scheduled";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel_action: "cancel_end_of_cycle",
	});

	const entityAfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel_action: "uncancel",
	});

	const entityAfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entityAfterUncancel,
		productId: pro.id,
	});

	expect(entityAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
