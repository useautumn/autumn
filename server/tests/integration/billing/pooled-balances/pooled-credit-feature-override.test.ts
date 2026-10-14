/** A pooled credit balance prices usage by its contributors' feature_override;
 * a plan with a different rate card gets its own pool. */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	CheckResponseV2,
	FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const excludesAction1: FeatureConfigOverride = {
	schema: [
		{ metered_feature_id: TestFeature.Action1, excluded: true },
		{ metered_feature_id: TestFeature.Action2, credit_amount: 2 },
	],
};

const pooledCreditsPlan = ({
	id,
	group,
	grant,
	featureOverride,
}: {
	id: string;
	group: string;
	grant: number;
	featureOverride?: FeatureConfigOverride;
}) => {
	const creditsItem = items.monthlyCredits({ includedUsage: grant });
	return products.base({
		id,
		group,
		items: [
			{
				...creditsItem,
				pooled: true,
				config: { ...creditsItem.config, feature_override: featureOverride },
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled credit override: an excluded feature never draws from the pool")}`,
	async () => {
		const customerId = "pooled-override-excluded";
		const plan = pooledCreditsPlan({
			id: "pooled-override-excluded",
			group: "a",
			grant: 100,
			featureOverride: excludesAction1,
		});

		const { autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		for (const entityId of [undefined, entities[0]!.id]) {
			const check = await autumnV2_3.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Action1,
			});
			expect(check.allowed).toBe(false);

			await autumnV1
				.track({
					customer_id: customerId,
					entity_id: entityId,
					feature_id: TestFeature.Action1,
					value: 10,
				})
				.catch(() => undefined);
		}

		// The pool still funds Action2 at the contributor's override rate.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 10,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 80,
			usage: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled credit override: a plan with a different rate card pools separately")}`,
	async () => {
		const customerId = "pooled-override-conflict";
		const inheriting = pooledCreditsPlan({
			id: "pooled-override-inheriting",
			group: "a",
			grant: 100,
		});
		const excluding = pooledCreditsPlan({
			id: "pooled-override-excluding",
			group: "b",
			grant: 1_000,
			featureOverride: excludesAction1,
		});

		const { autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [inheriting, excluding] }),
			],
			actions: [
				s.billing.attach({ productId: inheriting.id, entityIndex: 0 }),
				s.billing.attach({ productId: excluding.id, entityIndex: 0 }),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});
		expect(customer.features[TestFeature.Credits]!.balance).toBe(1_100);

		// Action1 at 0.2 credits: 600 needs 120, more than the only pool that covers it.
		const check = await autumnV2_3.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0]!.id,
			feature_id: TestFeature.Action1,
			required_balance: 600,
		});
		expect(check.allowed).toBe(false);

		const withinPool = await autumnV2_3.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0]!.id,
			feature_id: TestFeature.Action1,
			required_balance: 400,
		});
		expect(withinPool.allowed).toBe(true);
	},
);
