import { test } from "bun:test";
import { ErrCode, type UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-checkout error: no changes with redirect mode")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.dashboard()],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "err-update-checkout-no-changes",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"Cannot create checkout when no billing changes will happen in this update",
		func: async () => {
			await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				redirect_mode: "always",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("update-checkout error: prepaid no changes with redirect mode")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
			}),
		],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "err-update-checkout-prepaid-no-changes",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
		],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage:
			"Cannot create checkout when quantities are not updated or adjustable",
		func: async () => {
			await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				redirect_mode: "always",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("update-checkout error: cancel action with redirect mode")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [items.dashboard()],
	});

	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "err-update-checkout-cancel-action",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		errMessage: "Autumn checkout does not support cancel or uncancel updates",
		func: async () => {
			await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				redirect_mode: "always",
			});
		},
	});
});
