import { test } from "bun:test";
import { type AttachParamsV1Input, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const DAY_MS = 1000 * 60 * 60 * 24;

test.concurrent(`${chalk.yellowBright("attach-billing-cycle-anchor-errors 1: scheduled downgrade with reset is blocked")}`, async () => {
	const customerId = "attach-anchor-downgrade-error";
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"billing_cycle_anchor resets are not supported for scheduled switches",
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: pro.id,
				billing_cycle_anchor: "now",
				redirect_mode: "if_required",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("attach-billing-cycle-anchor-errors 2: past timestamp is blocked")}`, async () => {
	const customerId = "attach-anchor-past-ts-error";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
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
		errMessage: "billing_cycle_anchor cannot be set to a past timestamp",
		func: async () => {
			await autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: premium.id,
				billing_cycle_anchor: advancedTo - DAY_MS,
				redirect_mode: "if_required",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("attach-billing-cycle-anchor-errors 3: anchor with trial is blocked")}`, async () => {
	const customerId = "attach-anchor-trial-error";
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"billing_cycle_anchor cannot be used together with a free trial",
		func: async () => {
			await autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: proTrial.id,
				billing_cycle_anchor: "now",
				redirect_mode: "if_required",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("attach-billing-cycle-anchor-errors 4: anchor on one-off product is blocked")}`, async () => {
	const customerId = "attach-anchor-oneoff-error";
	const oneOff = products.oneOff({
		id: "oneoff",
		items: [items.oneOffPrice({ price: 50 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "billing_cycle_anchor is not supported for one-off products",
		func: async () => {
			await autumnV2_2.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: oneOff.id,
				billing_cycle_anchor: "now",
				redirect_mode: "if_required",
			});
		},
	});
});
