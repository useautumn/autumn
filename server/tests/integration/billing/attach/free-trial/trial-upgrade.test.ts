import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("trial-upgrade 1: trialing pro to premium with trial (fresh trial)")}`, async () => {
	const customerId = "trial-upgrade-pro-to-premium-trial";

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

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [proTrial.id],
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
		customerId,
		autumn: autumnV1,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
});

test.concurrent(`${chalk.yellowBright("trial-upgrade 2: trialing pro to premium without trial (trial ends)")}`, async () => {
	const customerId = "trial-upgrade-pro-to-premium-no-trial";

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

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premium] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	const now = Date.now();
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: now + ms.days(7),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	expect(preview.total).toBe(50);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [proTrial.id],
	});

	await expectProductNotTrialing({
		customer,
		productId: premium.id,
		nowMs: advancedTo,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: addMonths(now, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		count: 2,
		latestTotal: 50,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-upgrade 3: non-trialing pro to premium with trial")}`, async () => {
	const customerId = "trial-upgrade-notrial-to-trial";

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

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premiumTrial] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
	});
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [pro.id],
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
		customerId,
		autumn: autumnV1,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		count: 3,
		invoiceIndex: 1,
		latestTotal: -20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

test.concurrent(`${chalk.yellowBright("trial-upgrade 4: mid-trial upgrade to premium with trial (fresh trial)")}`, async () => {
	const customerId = "trial-upgrade-mid-trial-fresh";

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

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(4),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		redirect_mode: "if_required",
	});

	await timeout(4000);
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premiumTrial.id],
		notPresent: [proTrial.id],
	});

	await expectProductTrialing({
		customer,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(1) + ms.minutes(10),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(1) + ms.minutes(10),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
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
});
