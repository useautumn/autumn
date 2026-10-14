import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

test.concurrent(`${chalk.yellowBright("trial-multi: free to paid with trial merges with existing subscription")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-separate",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.attach({ productId: free.id, entityIndex: 1 }),
			],
		});

	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: free.id,
	});

	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	};

	await autumnV1.subscriptions.update(updateParams);

	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-multi: free to paid with trial applies trial to all entities")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro",
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-free-to-trial",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: free.id, entityIndex: 1 }),
			],
		});

	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0,
		productId: pro.id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: free.id,
	});

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(-20);

	await autumnV1.subscriptions.update(updateParams, { timeout: 4000 });

	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-multi: setting trial on one entity applies to all")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro",
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-set-trial",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0,
		productId: pro.id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: pro.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(-40);

	await autumnV1.subscriptions.update(updateParams, { timeout: 4000 });

	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-multi: removing trial on one entity removes from all")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-remove-trial",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.attach({ productId: proTrial.id, entityIndex: 1 }),
			],
		});

	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(40);

	await autumnV1.subscriptions.update(updateParams);

	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0After,
		productId: proTrial.id,
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1After,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("trial-multi: trial preserved when schedule exists")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-multi-schedule-preserve",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	const newTrialEnd = customer.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;
	expect(Math.abs(newTrialEnd! - initialTrialEnd!)).toBeLessThan(60000);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-multi: trial with scheduled downgrade")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
		freeTrial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: false,
			card_required: true,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-multi-scheduled-down",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premium.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	await expectProductTrialing({
		customer,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-multi: entity on free product updates with trial while others on pro")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro",
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: false,
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-entity3-free",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.attach({ productId: free.id, entityIndex: 2 }),
			],
		});

	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0,
		productId: pro.id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductActive({
		customer: entity2,
		productId: free.id,
	});

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: free.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams, { timeout: 4000 });

	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductNotTrialing({
		customer: entity0After,
		productId: pro.id,
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductNotTrialing({
		customer: entity1After,
		productId: pro.id,
	});

	const entity2After = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductTrialing({
		customer: entity2After,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});
});
