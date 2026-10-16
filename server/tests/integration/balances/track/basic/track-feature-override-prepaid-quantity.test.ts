/**
 * Contract: changing the purchased quantity of a prepaid credits item keeps
 * its feature_override. After subscriptions.update with feature_quantities the
 * balance reflects the new quantity, the override rate still prices tracks and
 * the excluded feature is still denied and draws nothing.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	CheckResponseV3,
	FeatureConfigOverride,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.prepaid>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("feature-override prepaid: a quantity update keeps the override")}`,
	async () => {
		// Catalog Credits: Action1 = 0.2, Action2 = 0.6.
		const creditsItem = withFeatureOverride(
			items.prepaid({ featureId: TestFeature.Credits, billingUnits: 100 }),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					{ metered_feature_id: TestFeature.Action2, excluded: true },
				],
			},
		);
		const pro = products.pro({ id: "override-prepaid", items: [creditsItem] });

		const { customerId, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "override-prepaid-quantity",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Credits, quantity: 200 }],
				}),
				// 40 * 0.5 = 20 credits at the override rate.
				s.track({ featureId: TestFeature.Action1, value: 40, timeout: 2000 }),
			],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Credits, quantity: 400 }],
		});

		const excludedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
		});
		expect(excludedCheck.allowed).toBe(false);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 40,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 10,
		});

		// Two Action1 tracks at 0.5 = 40 credits; Action2 adds nothing.
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 360,
			usage: 40,
		});
	},
	{ timeout: 180_000 },
);
