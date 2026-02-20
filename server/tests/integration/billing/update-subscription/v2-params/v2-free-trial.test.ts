import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
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

test.concurrent(`${chalk.yellowBright("v2-free-trial update: set trial with v1 free_trial params")}`, async () => {
	const customerId = "v2-update-free-trial-set";

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
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			free_trial: {
				duration_length: 7,
				duration_type: FreeTrialDuration.Day,
			},
		},
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20,
	});

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(7),
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: -20,
	});
});

test.concurrent(`${chalk.yellowBright("v2-free-trial update: remove trial with free_trial null")}`, async () => {
	const customerId = "v2-update-free-trial-remove";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 14,
	});

	const { autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }),
		],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: proTrial.id,
		customize: {
			free_trial: null,
		},
	};

	const preview =
		await autumnV2.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			params,
		);
	expect(preview.total).toBe(20);

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("v2-free-trial update: replace active trial with month trial")}`, async () => {
	const customerId = "v2-update-free-trial-replace";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
	});

	const { autumnV1, autumnV2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	const params: UpdateSubscriptionV1ParamsInput = {
		customer_id: customerId,
		plan_id: proTrial.id,
		customize: {
			free_trial: {
				duration_length: 1,
				duration_type: FreeTrialDuration.Month,
			},
		},
	};

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: addMonths(advancedTo, 1).getTime(),
		toleranceMs: ms.hours(2),
	});
});
