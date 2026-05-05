import { test } from "bun:test";
import {
	type AttachParamsV0Input,
	type AttachParamsV1Input,
	ErrCode,
	FreeTrialDuration,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, subDays } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("starts_at: past dates are rejected")}`,
	async () => {
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
			errMessage: "starts_at cannot be set to a past timestamp",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					starts_at: subDays(advancedTo, 1).getTime(),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: future date rejects free plans")}`,
	async () => {
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
			errMessage: "Future starts_at is only supported for paid recurring plans",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: free.id,
					starts_at: addDays(advancedTo, 1).getTime(),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: future date rejects one-off plans")}`,
	async () => {
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
			errMessage: "Future starts_at is only supported for paid recurring plans",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: oneOff.id,
					starts_at: addDays(advancedTo, 1).getTime(),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: future date rejects end of cycle plan schedule")}`,
	async () => {
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
				"starts_at cannot be used together with plan_schedule: end_of_cycle",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					starts_at: addDays(advancedTo, 1).getTime(),
					plan_schedule: "end_of_cycle",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: beta future date rejects end of cycle plan schedule")}`,
	async () => {
		const customerId = "attach-start-date-beta-end-of-cycle";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1Beta, advancedTo } = await initScenario({
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
				"starts_at cannot be used together with plan_schedule: end_of_cycle",
			func: () =>
				autumnV1Beta.billing.attach<AttachParamsV0Input>({
					customer_id: customerId,
					product_id: pro.id,
					starts_at: addDays(advancedTo, 1).getTime(),
					plan_schedule: "end_of_cycle",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: future date rejects invoice mode")}`,
	async () => {
		const customerId = "attach-start-date-invoice-mode";
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
			errMessage: "Future starts_at cannot be used together with invoice mode",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					starts_at: addDays(advancedTo, 1).getTime(),
					invoice_mode: {
						enabled: true,
						enable_plan_immediately: true,
						finalize: false,
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: beta future date rejects invoice mode")}`,
	async () => {
		const customerId = "attach-start-date-beta-invoice-mode";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1Beta, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Future starts_at cannot be used together with invoice mode",
			func: () =>
				autumnV1Beta.billing.attach<AttachParamsV0Input>({
					customer_id: customerId,
					product_id: pro.id,
					starts_at: addDays(advancedTo, 1).getTime(),
					invoice: true,
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: future date rejects free trials")}`,
	async () => {
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
			errMessage: "Future starts_at cannot be used together with a free trial",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: proTrial.id,
					starts_at: addDays(advancedTo, 1).getTime(),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at: beta future date rejects custom free trial")}`,
	async () => {
		const customerId = "attach-start-date-beta-trial";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1Beta, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Future starts_at cannot be used together with a free trial",
			func: () =>
				autumnV1Beta.billing.attach<AttachParamsV0Input>({
					customer_id: customerId,
					product_id: pro.id,
					starts_at: addDays(advancedTo, 1).getTime(),
					free_trial: {
						length: 7,
						duration: FreeTrialDuration.Day,
						card_required: true,
					},
				}),
		});
	},
);
