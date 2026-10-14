import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0, ms } from "@autumn/shared";
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
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 1: entity upgrade to product with trial")}`, async () => {
	const customerId = "trial-ent-upgrade-with-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
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
		trialEndsAt: advancedTo + ms.days(7),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 0,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});
	await timeout(4000);

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 0,
		latestInvoiceProductId: premiumTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 2: entity upgrade to product without trial (trial ends)")}`, async () => {
	const customerId = "trial-ent-upgrade-no-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
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
			s.products({ list: [proTrial, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
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
		trialEndsAt: advancedTo + ms.days(7),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(70);
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductNotTrialing({
		customer: entity1,
		productId: premium.id,
		nowMs: advancedTo,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 70,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 3: entity downgrade during trial (scheduled)")}`, async () => {
	const customerId = "trial-ent-downgrade-scheduled";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	let { autumnV1, ctx, advancedTo, entities, testClockId } = await initScenario(
		{
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premiumTrial, proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premiumTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: premiumTrial.id, entityIndex: 1 }),
			],
		},
	);

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 70,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	await expectProductCanceling({
		customer: entity1,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectProductScheduled({
		customer: entity1,
		productId: proTrial.id,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity2,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: proTrial.id,
	});
	await expectProductNotTrialing({
		customer: entity1After,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premiumTrial.id,
	});
	await expectProductNotTrialing({
		customer: entity2After,
		productId: premiumTrial.id,
		nowMs: advancedTo,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
		latestTotal: 70,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 4: mixed products after entity upgrade")}`, async () => {
	const customerId = "trial-ent-upgrade-mixed";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, premiumTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
			],
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
		trialEndsAt: advancedTo + ms.days(7),
	});

	const advancedTo3Days = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
	});

	const newTrialEnd = advancedTo3Days + ms.days(14);

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 0,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	await timeout(4000);

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
		trialEndsAt: newTrialEnd,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2,
		productId: proTrial.id,
	});
	await expectProductTrialing({
		customer: entity2,
		productId: proTrial.id,
		trialEndsAt: newTrialEnd,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 5: both entities upgrade proTrial → premiumTrial")}`, async () => {
	const customerId = "trial-ent-both-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
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
		trialEndsAt: advancedTo + ms.days(7),
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview1.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview: preview1,
		total: 0,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});
	await timeout(4000);

	const entity1Mid = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1Mid,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1Mid,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity2Mid = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2Mid,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity2Id,
	});
	expect(preview2.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity2Id,
		redirect_mode: "if_required",
	});
	await timeout(4000);

	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1After,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity2After,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 6: non-trialing upgrade to trial product")}`, async () => {
	const customerId = "trial-ent-notrial-to-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premiumTrial] }),
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
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(-40);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
		invoiceIndex: 1,
		latestTotal: -40,
	});

	await timeout(4000);

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});
