import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

test.concurrent(`${chalk.yellowBright("schedules-f2p: cancel entity 1, upgrade entity 2")}`, async () => {
	const customerId = "sched-cancel-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: free.id, entityIndex: 1 }),
			s.cancel({ productId: pro.id, entityIndex: 0 }),
		],
	});

	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});

	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: pro.id,
	});

	await expectProductActive({
		customer: entity2AfterCycle,
		productId: free.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2AfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("schedules-f2p: downgrade entity 1, upgrade entity 2")}`, async () => {
	const customerId = "sched-downgrade-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[1].id,
		subCount: 1,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({ customer: entity1AfterCycle, productId: pro.id });

	await expectProductActive({
		customer: entity2AfterCycle,
		productId: free.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2AfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
