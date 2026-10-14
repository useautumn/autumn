import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("trial-override-merge 1: add-on with free_trial override to active sub")}`, async () => {
	const customerId = "trial-override-merge-addon-active";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const addonItem = items.dashboard();
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
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
		product_id: addon.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 40,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addon.id],
	});

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	await expectProductTrialing({
		customer,
		productId: addon.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

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

test.concurrent(`${chalk.yellowBright("trial-override-merge 2: add-on with free_trial: null to trialing sub")}`, async () => {
	const customerId = "trial-override-merge-addon-null";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const addonItem = items.dashboard();
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: null,
	});
	expect(preview.total).toBe(40);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	await expectProductNotTrialing({
		customer,
		productId: addon.id,
		nowMs: advancedTo,
	});

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

test.concurrent(`${chalk.yellowBright("trial-override-merge 3: add-on with free_trial override replaces existing trial")}`, async () => {
	const customerId = "trial-override-merge-addon-replace";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const addonItem = items.dashboard();
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 2 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(5),
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		total: 0,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(1) + ms.minutes(10),
	});

	await expectProductTrialing({
		customer,
		productId: addon.id,
		trialEndsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(1) + ms.minutes(10),
	});

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
});
