import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test(`${chalk.yellowBright("feature-grant-first-time: blocked after purchase, fresh customer redeems")}`, async () => {
	const customerId = "fg-first-time-paid";
	const freshCustomerId = "fg-first-time-fresh";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.otherCustomers([{ id: freshCustomerId }]),
			s.featureGrant({
				entitlements: [{ feature_id: TestFeature.Messages, allowance: 10 }],
				promoCodes: [{ code: "FIRSTTIMEMSG", first_time_transaction: true }],
			}),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.PromoCodeFirstTimeOnly,
		func: async () => {
			await autumnV1.rewards.redeem({
				code: "FIRSTTIMEMSG",
				customerId,
			});
		},
	});

	const blockedCheck = await autumnV1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(blockedCheck.balance ?? 0).toBe(0);

	await autumnV1.rewards.redeem({
		code: "FIRSTTIMEMSG",
		customerId: freshCustomerId,
	});

	const freshCheck = await autumnV1.check({
		customer_id: freshCustomerId,
		feature_id: TestFeature.Messages,
	});
	expect(freshCheck.allowed).toBe(true);
	expect(freshCheck.balance).toBe(10);
});
