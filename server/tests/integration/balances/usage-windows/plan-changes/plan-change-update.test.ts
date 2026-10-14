import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	expectUsageWindowSynced,
	fetchActivePlanCusEnt,
} from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("uw-plan-change-update1: a base-price-only customize preserves the cycle and the counter")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-update-price-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await expectUsageWindowSynced({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
		});
		const entBefore = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(entBefore?.next_reset_at).toBeTruthy();

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: { amount: 50, interval: "month" },
			},
		});

		const entAfter = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(entAfter?.id).toBe(entBefore.id);
		expect(Number(entAfter?.next_reset_at)).toBe(
			Number(entBefore.next_reset_at),
		);

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		await expectUsageWindowSynced({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			windowEndAt: Number(entBefore.next_reset_at),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("uw-plan-change-update2: updating the capped item preserves the cycle and the counter")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-update-item-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await expectUsageWindowSynced({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
		});

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 500,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);
