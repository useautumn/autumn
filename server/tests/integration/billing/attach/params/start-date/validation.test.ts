import { test } from "bun:test";
import { type AttachParamsV1Input, ErrCode, ms } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("start_date: past dates are rejected")}`, async () => {
	const customerId = "attach-start-date-past";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "start_date cannot be set to a past timestamp",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				start_date: advancedTo - ms.days(1),
			}),
	});
});

test.concurrent(`${chalk.yellowBright("start_date: future date rejects free plans")}`, async () => {
	const customerId = "attach-start-date-free";
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "Future start_date is only supported for paid recurring plans",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: free.id,
				start_date: advancedTo + ms.days(1),
			}),
	});
});

test.concurrent(`${chalk.yellowBright("start_date: future date rejects one-off plans")}`, async () => {
	const customerId = "attach-start-date-one-off";
	const oneOff = products.oneOff({
		id: "one-off",
		items: [items.oneOffMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "Future start_date is only supported for paid recurring plans",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: oneOff.id,
				start_date: advancedTo + ms.days(1),
			}),
	});
});

test.concurrent(`${chalk.yellowBright("start_date: future date rejects customers without payment method")}`, async () => {
	const customerId = "attach-start-date-no-payment-method";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "Future start_date requires a saved payment method",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				start_date: advancedTo + ms.days(1),
			}),
	});
});

test.concurrent(`${chalk.yellowBright("start_date: future date rejects end of cycle plan schedule")}`, async () => {
	const customerId = "attach-start-date-end-of-cycle";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"start_date cannot be used together with plan_schedule: end_of_cycle",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				start_date: advancedTo + ms.days(1),
				plan_schedule: "end_of_cycle",
			}),
	});
});

test.concurrent(`${chalk.yellowBright("start_date: future date rejects switches")}`, async () => {
	const customerId = "attach-start-date-switch";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"start_date is only supported when attaching a new subscription",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: premium.id,
				start_date: advancedTo + ms.days(1),
			}),
	});
});

test.concurrent(`${chalk.yellowBright("start_date: future date rejects free trials")}`, async () => {
	const customerId = "attach-start-date-trial";
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		trialDays: 7,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "Future start_date cannot be used together with a free trial",
		func: () =>
			autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: proTrial.id,
				start_date: advancedTo + ms.days(1),
			}),
	});
});
