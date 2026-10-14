import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	FreeTrialDuration,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("trial-override-entity 1: entity attach with free_trial to active sub")}`, async () => {
	const customerId = "trial-override-entity-active";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 40,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	await timeout(4000);

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 0,
	});

	expect(customer.invoices?.[1]?.total).toBe(-20);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-override-entity 2: entity attach with free_trial: null to trialing sub")}`, async () => {
	const customerId = "trial-override-entity-null";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
		free_trial: null,
	});
	expect(preview.total).toBe(40);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	await timeout(4000);

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 40,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-override-entity 3: entity upgrade with free_trial override")}`, async () => {
	const customerId = "trial-override-entity-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(-40);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 70,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	await timeout(4000);

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: premium.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
		latestTotal: 0,
	});

	expect(customer.invoices?.[1]?.total).toBe(-40);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});
