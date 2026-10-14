import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("trial-override-basic 1: fresh attach with free_trial override")}`, async () => {
	const customerId = "trial-override-basic-fresh";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	expectCustomerInvoiceCorrect({
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
});

test.concurrent(`${chalk.yellowBright("trial-override-basic 2: override product's trial config")}`, async () => {
	const customerId = "trial-override-basic-override-config";

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
		free_trial: {
			length: 1,
			duration: FreeTrialDuration.Month,
		},
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: addMonths(advancedTo, 1).getTime(),
		total: 20,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 1,
			duration: FreeTrialDuration.Month,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: addMonths(advancedTo, 1).getTime(),
		toleranceMs: ms.hours(2),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo, 1).getTime(),
		toleranceMs: ms.hours(2),
	});

	expectCustomerInvoiceCorrect({
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
});

test.concurrent(`${chalk.yellowBright("trial-override-basic 3: override bypasses deduplication")}`, async () => {
	const customerId = "trial-override-basic-bypass-dedup";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }),
			s.updateSubscription({
				productId: proTrial.id,
				cancelAction: "cancel_immediately" as const,
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const hasProduct = customerBefore.products.some(
		(p) => p.id === proTrial.id && p.status === "active",
	);
	expect(hasProduct).toBe(false);

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
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
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(2),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(2),
	});

	expectCustomerInvoiceCorrect({
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
});
