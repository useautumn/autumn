/**
 * Contract: dimensions price a track made against a license seat exactly as they
 * do a plain customer plan. The seat decides which balance is drawn from; the
 * event's properties decide the rate.
 */

import { test } from "bun:test";
import type { ApiEntityV2, FeatureConfigOverride } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 1_000;

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
	`${chalk.yellowBright("license credit dimensions: a seat's credits are deducted at the matched rate")}`,
	async () => {
		const customerId = "license-credit-dimensions";
		const licenseGroup = "license-credit-dimensions-seats";

		const parent = products.base({
			id: "license-credit-dimensions-parent",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const seat = products.base({
			id: "license-credit-dimensions-seat",
			group: licenseGroup,
			items: [
				{
					...items.monthlyCredits({ includedUsage: GRANT }),
					config: {
						...items.monthlyCredits({ includedUsage: GRANT }).config,
						feature_override: dimensionedAction1,
					},
				},
			],
		});

		const { autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 0,
				}),
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [{ licenseProductId: seat.id, quantity: 1 }],
				}),
				s.licenses.assign({
					licenseProductId: seat.id,
					entityIndexes: [0],
				}),
				// 2 x 16 = 32, then 4 x 16 x 0.5 = 32 — both off the seat's credits.
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
					entityIndex: 0,
					properties: { size: "large", lifecycle: "spot" },
					timeout: 2_000,
				}),
			],
		});

		// The seat's credits are entity-scoped, so read them from the assigned entity.
		const seatHolder = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: seatHolder,
			featureId: TestFeature.Credits,
			granted: GRANT,
			remaining: GRANT - 64,
			usage: 64,
		});
	},
);
