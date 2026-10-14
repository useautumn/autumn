import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("trial-override-null 1: attach with free_trial: null (product has trial)")}`, async () => {
	const customerId = "trial-override-null-has-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	});
	expect(preview.total).toBe(20);
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-override-null 2: free product with free_trial: null")}`, async () => {
	const customerId = "trial-override-null-free-product";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx } = await initScenario({
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
		free_trial: null,
	});
	expect(preview.total).toBe(0);
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	await expectProductNotTrialing({
		customer,
		productId: freeWithTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
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

test.concurrent(`${chalk.yellowBright("trial-override-null 3: entity pro isolated from customer-level attach with free_trial: null")}`, async () => {
	const customerId = "trial-override-null-entity-isolated";

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

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 20,
	});

	const advancedToAfterCycle = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entity1AfterCycle = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({ customer: entity1AfterCycle, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity1AfterCycle,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	const entity2AfterCycle = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2AfterCycle, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity2AfterCycle,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: freeWithTrial.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterAttach,
		productId: freeWithTrial.id,
		nowMs: advancedToAfterCycle,
	});

	const entity1AfterAttach = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1AfterAttach,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: entity1AfterAttach,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	const entity2AfterAttach = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2AfterAttach,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: entity2AfterAttach,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
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
		customer: customerAfterAttach,
		count: 3,
		latestTotal: 40,
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
