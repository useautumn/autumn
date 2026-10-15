/**
 * Contract: an event name that fans out to two metered features of one credit
 * system draws only for the features the plan's override keeps. With
 * SharedAction2 excluded, "shared-credit-event" draws SharedAction1 alone.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	FeatureConfigOverride,
	TrackResponseV3,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("track-event-name feature-override: an excluded feature drops out of the fan-out")}`,
	async () => {
		// Catalog SharedCredits: SharedAction1 = 1, SharedAction2 = 2.
		const creditsItem = withFeatureOverride(
			items.free({ featureId: TestFeature.SharedCredits, includedUsage: 100 }),
			{
				schema: [
					{ metered_feature_id: TestFeature.SharedAction2, excluded: true },
				],
			},
		);
		const plan = products.base({ id: "shared-credits", items: [creditsItem] });

		const { customerId, autumnV2_3 } = await initScenario({
			customerId: "track-event-name-override-excluded",
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		// SharedAction1 draws 5 * 1 = 5; SharedAction2 would add 5 * 2.
		const response: TrackResponseV3 = await autumnV2_3.track({
			customer_id: customerId,
			event_name: "shared-credit-event",
			value: 5,
		});
		expect(response.balance?.feature_id).toBe(TestFeature.SharedCredits);
		expect(response.balance?.remaining).toBe(95);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.SharedCredits,
			remaining: 95,
			usage: 5,
		});
	},
);
