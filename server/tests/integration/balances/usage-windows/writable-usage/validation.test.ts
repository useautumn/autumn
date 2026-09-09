/**
 * Writable usage-limit counters — request validation and atomicity.
 *
 * Contract:
 *   Unknown feature_id -> feature_not_found, nothing written.
 *   usage > 0 with no cap configured for the feature -> 400.
 *   Negative usage -> invalid_inputs.
 *   One bad entry rejects the whole list: valid entries in the same request
 *   are not applied.
 */

import { test } from "bun:test";
import { ApiVersion, ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("writable-usage-validation1: unknown feature and missing cap are rejected")}`,
	async () => {
		const product = products.base({
			id: "wu-val-reject",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "wu-val-reject-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.FeatureNotFound,
			func: () =>
				autumn.customers.updateRpc(customerId, {
					billing_controls: {
						usage_limits: [{ feature_id: "does-not-exist", usage: 1 }],
					},
				}),
		});

		await expectAutumnError({
			errMessage: "No usage limit configured",
			func: () =>
				autumn.customers.updateRpc(customerId, {
					billing_controls: {
						usage_limits: [{ feature_id: TestFeature.Messages, usage: 4 }],
					},
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			func: () =>
				autumn.customers.updateRpc(customerId, {
					billing_controls: {
						usage_limits: [{ feature_id: TestFeature.Messages, usage: -1 }],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("writable-usage-validation2: one bad entry rejects the whole list")}`,
	async () => {
		const product = products.base({
			id: "wu-val-atomic",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		const { customerId } = await initScenario({
			customerId: "wu-val-atomic-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await expectAutumnError({
			errCode: ErrCode.FeatureNotFound,
			func: () =>
				autumn.customers.updateRpc(customerId, {
					billing_controls: {
						usage_limits: [
							{ feature_id: TestFeature.Messages, usage: 7 },
							{ feature_id: "does-not-exist", usage: 1 },
						],
					},
				}),
		});

		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
			skipCache: true,
		});
	},
);
