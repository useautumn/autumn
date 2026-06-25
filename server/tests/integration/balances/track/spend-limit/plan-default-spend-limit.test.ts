/**
 * Plan-default spend_limit: when the customer (and entity) have no spend_limit,
 * the plan's snapshotted overage_limit is enforced — overage spend is capped at
 * the plan value and further overage rejects.
 *
 * Mirrors track-customer-spend-limit1 but seeds the cap at the PLAN tier via
 * s.billing.attach({ billingControls }) instead of customers.update, exercising
 * the resolveBillingControl plan fallback.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("plan-default-spend-limit: a PLAN-DEFAULT spend_limit caps overage when customer is silent")}`,
	async () => {
		const prod = products.base({
			id: "plan-default-spend-limit",
			items: [
				items.lifetimeMessages({ includedUsage: 1000 }),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "plan-default-spend-limit-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [prod] }),
			],
			actions: [
				s.billing.attach({
					productId: prod.id,
					billingControls: {
						spend_limits: [
							{
								feature_id: TestFeature.Messages,
								enabled: true,
								overage_limit: 25,
							},
						],
					},
				}),
			],
		});

		// 1000 free + 100 included + overage up to the plan's 25 spend cap.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1120,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		// Plan spend cap exhausted -> further overage rejects.
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
