import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	CusProductStatus,
	ms,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerProductStatuses } from "@tests/integration/billing/utils/expectCustomerProductStatuses";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("trial-free-product 1: free product with trial")}`, async () => {
	const customerId = "trial-free-prod-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: freeWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-free-product 3: free trial to paid product")}`, async () => {
	const customerId = "trial-free-prod-to-paid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeWithTrial, pro] }),
		],
		actions: [s.billing.attach({ productId: freeWithTrial.id })],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [freeWithTrial.id],
	});

	await expectProductNotTrialing({
		customer,
		productId: pro.id,
		nowMs: advancedTo,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(Date.now(), 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("trial-free-product 4: free trial to paid trial product")}`, async () => {
	const customerId = "trial-free-prod-to-paid-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeWithTrial, proTrial] }),
		],
		actions: [s.billing.attach({ productId: freeWithTrial.id })],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 20,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id],
		notPresent: [freeWithTrial.id],
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});
});

test.concurrent(`${chalk.yellowBright("trial-free-product 6: free to different free with trial")}`, async () => {
	const customerId = "trial-free-prod-free-to-free";

	const messagesItem1 = items.monthlyMessages({ includedUsage: 100 });
	const free1 = products.baseWithTrial({
		id: "free1-trial",
		items: [messagesItem1],
		trialDays: 7,
		cardRequired: false,
	});

	const messagesItem2 = items.monthlyMessages({ includedUsage: 200 });
	const free2 = products.baseWithTrial({
		id: "free2-trial",
		items: [messagesItem2],
		trialDays: 14,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free1, free2] })],
		actions: [s.billing.attach({ productId: free1.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: free1.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free2.id,
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free2.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [free2.id],
		notPresent: [free1.id],
	});

	await expectProductTrialing({
		customer,
		productId: free2.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("trial-free-product 7: entity pro isolated from customer-level free trial")}`, async () => {
	const customerId = "trial-free-prod-entity-isolated";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [freeMessagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo, entities, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, freeWithTrial] }),
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
	await expectProductActive({ customer: entity1Before, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2Before, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity2Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		redirect_mode: "if_required",
	});

	const customerDuringTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerDuringTrial,
		productId: freeWithTrial.id,
	});
	await expectProductTrialing({
		customer: customerDuringTrial,
		productId: freeWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	const entity1DuringTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1DuringTrial,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const entity2DuringTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2DuringTrial,
		productId: pro.id,
		nowMs: advancedTo,
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

	await expectCustomerInvoiceCorrect({
		customer: customerDuringTrial,
		count: 2,
		latestTotal: 20,
	});

	const advancedToAfterTrial = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectProductNotPresent({
		customerId,
		autumn: autumnV1,
		productId: freeWithTrial.id,
	});
	await expectCustomerProductStatuses({
		ctx,
		customerId,
		productId: freeWithTrial.id,
		expected: { [CusProductStatus.Expired]: 1 },
	});

	const entity1AfterTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({ customer: entity1AfterTrial, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity1AfterTrial,
		productId: pro.id,
		nowMs: advancedToAfterTrial,
	});

	const entity2AfterTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2AfterTrial, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity2AfterTrial,
		productId: pro.id,
		nowMs: advancedToAfterTrial,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		count: 3,
		latestTotal: 40,
	});
});
