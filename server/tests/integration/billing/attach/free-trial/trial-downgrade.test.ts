import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
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
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("trial-downgrade 1: trialing premium to pro with trial")}`, async () => {
	const customerId = "trial-downgrade-premium-to-pro-trial";

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

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, proTrial] }),
		],
		actions: [s.billing.attach({ productId: premiumTrial.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);

	expectPreviewNextCycleCorrect({
		preview,
		total: 20,
		startsAt: advancedTo + ms.days(14),
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer,
		productId: premiumTrial.id,
	});

	await expectProductScheduled({
		customer,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	const advancedToAfterTrial = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: proTrial.id,
	});

	await expectProductActive({
		customer: customerAfter,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer: customerAfter,
		productId: proTrial.id,
		nowMs: advancedToAfterTrial,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-downgrade 2: trialing premium to pro without trial")}`, async () => {
	const customerId = "trial-downgrade-premium-to-pro-no-trial";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, pro] }),
		],
		actions: [s.billing.attach({ productId: premiumTrial.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 20,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer,
		productId: premiumTrial.id,
	});

	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	const advancedToAfterTrial = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectProductNotTrialing({
		customer: customerAfter,
		productId: pro.id,
		nowMs: advancedToAfterTrial,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-downgrade 3: non-trialing premium to pro with trial (no trial)")}`, async () => {
	const customerId = "trial-downgrade-notrial-premium-to-pro-trial";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, proTrial] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: premium.id,
		nowMs: advancedTo,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);

	expectPreviewNextCycleCorrect({
		preview,
		total: 20,
		startsAt: addMonths(advancedTo, 1).getTime(),
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	await expectProductScheduled({
		customer,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer,
		productId: premium.id,
		nowMs: advancedTo,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: proTrial.id,
	});

	await expectProductActive({
		customer: customerAfter,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer: customerAfter,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-downgrade 4: premium to free (no trial)")}`, async () => {
	const customerId = "trial-downgrade-premium-to-free";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, free] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: free.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 50,
	});
});

test.concurrent(`${chalk.yellowBright("trial-downgrade 5: trialing premium to free (does NOT inherit trial)")}`, async () => {
	const customerId = "trial-downgrade-trialing-premium-to-free";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumTrial, free] }),
		],
		actions: [s.billing.attach({ productId: premiumTrial.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free.id,
	});
	expect(preview.total).toBe(0);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	return;
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer,
		productId: premiumTrial.id,
	});

	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	const advancedToAfterTrial = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
		waitForSeconds: 30,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: free.id,
	});

	expectProductNotTrialing({
		customer: customerAfter,
		productId: free.id,
		nowMs: advancedToAfterTrial,
	});
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 0,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		org: ctx.org,
		env: ctx.env,
		customerId,
	});
});
