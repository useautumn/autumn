import { test } from "bun:test";
import { ErrCode, type UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Update Subscription — Billing Cycle Anchor Error Tests
 *
 * Validates that billing_cycle_anchor: "now" is rejected for
 * one-off products, active trials, cancel actions, and feature_quantities.
 */

test.concurrent(`${chalk.yellowBright("update-sub anchor-reset-errors 1: one-off product is blocked")}`, async () => {
	const customerId = "update-sub-anchor-err-oneoff";

	const oneOff = products.oneOff({
		id: "oneoff",
		items: [],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [s.attach({ productId: oneOff.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "billing_cycle_anchor is not supported for one-off products",
		func: async () => {
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: oneOff.id,
				billing_cycle_anchor: "now",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("update-sub anchor-reset-errors 2: cancel action with anchor reset is blocked")}`, async () => {
	const customerId = "update-sub-anchor-err-cancel";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"billing_cycle_anchor cannot be used together with a cancel action",
		func: async () => {
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				billing_cycle_anchor: "now",
				cancel_action: "cancel_end_of_cycle",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("update-sub anchor-reset-errors 3: active trial is blocked")}`, async () => {
	const customerId = "update-sub-anchor-err-trial";

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
		actions: [s.attach({ productId: proTrial.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"billing_cycle_anchor cannot be used together with a free trial",
		func: async () => {
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: proTrial.id,
				billing_cycle_anchor: "now",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("update-sub anchor-reset-errors 4: feature_quantities with anchor reset is blocked")}`, async () => {
	const customerId = "update-sub-anchor-err-qty";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: "messages", quantity: 300 }],
			}),
		],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"billing_cycle_anchor cannot be used together with feature_quantities",
		func: async () => {
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				feature_quantities: [{ feature_id: "messages", quantity: 500 }],
				billing_cycle_anchor: "now",
			});
		},
	});
});
