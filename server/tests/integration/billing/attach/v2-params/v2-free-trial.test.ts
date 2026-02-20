import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("v2-free-trial attach: set trial with v1 free_trial params")}`, async () => {
	const customerId = "v2-attach-free-trial-set";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
		customize: {
			free_trial: {
				duration_length: 7,
				duration_type: FreeTrialDuration.Day,
			},
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(7),
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});
});

test.concurrent(`${chalk.yellowBright("v2-free-trial attach: remove product trial with free_trial null")}`, async () => {
	const customerId = "v2-attach-free-trial-null";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 14,
	});

	const { autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proTrial.id,
		redirect_mode: "if_required",
		customize: {
			free_trial: null,
		},
	};

	const preview =
		await autumnV2.billing.previewAttach<AttachParamsV1Input>(params);
	expect(preview.total).toBe(20);

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("v2-free-trial attach: month-based v1 free_trial params")}`, async () => {
	const customerId = "v2-attach-free-trial-month";

	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const { autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		redirect_mode: "if_required",
		customize: {
			free_trial: {
				duration_length: 1,
				duration_type: FreeTrialDuration.Month,
			},
		},
	};

	await autumnV2.billing.attach<AttachParamsV1Input>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: addMonths(advancedTo, 1).getTime(),
		toleranceMs: ms.hours(2),
	});
});
