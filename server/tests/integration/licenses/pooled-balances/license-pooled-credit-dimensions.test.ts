/**
 * Contract: all three mechanisms compose. Seats are licensed, their credits are
 * pooled across those seats, and a track is priced by its event properties —
 * the licence decides who may spend, the pool decides which balance, and the
 * dimension decides how much.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 1_000;
const SEAT_COUNT = 2;

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.5 },
			},
		},
	],
};

test.concurrent(
	`${chalk.yellowBright("license pooled credit dimensions: seats share one pool priced by properties")}`,
	async () => {
		const customerId = "lic-pool-credit-dimensions";
		const creditItem = items.monthlyCredits({ includedUsage: GRANT });
		const parent = products.base({
			id: "lic-pool-credit-dimensions-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "lic-pool-credit-dimensions-seat",
			items: [
				{
					...creditItem,
					pooled: true,
					config: {
						...creditItem.config,
						feature_override: dimensionedAction1,
					},
				},
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: SEAT_COUNT, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: SEAT_COUNT,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0, 1],
				}),
				// Each seat spends at a different dimensioned rate, from one pool.
				s.track({
					featureId: TestFeature.Action1,
					value: 2,
					entityIndex: 0,
					properties: { size: "large" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 4,
					entityIndex: 1,
					properties: { size: "large", lifecycle: "spot" },
					timeout: 2_000,
				}),
			],
		});

		// 2 x 16 = 32, plus 4 x 16 x 0.5 = 32 — both drawn from the shared pool.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances?.[TestFeature.Credits]).toMatchObject({
			remaining: GRANT * SEAT_COUNT - 64,
			usage: 64,
		});
	},
);
