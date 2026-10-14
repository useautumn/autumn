import { expect, test } from "bun:test";
import type { ProductItem, TrackResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { findCustomerEntitlement } from "../../utils/findCustomerEntitlement.js";

const POLL_TIMEOUT_MS = 30_000;

test.concurrent(
	`${chalk.yellowBright("unlimited-mixed: unlimited credits absorbs the track, metered action1 stays untouched")}`,
	async () => {
		const customerId = "unlim-mixed-finite";
		const includedActionUsage = 100;

		const mixedProduct = products.base({
			id: "unlim-mixed-prod",
			items: [
				constructFeatureItem({
					featureId: TestFeature.Action1,
					includedUsage: includedActionUsage,
				}) as ProductItem,
				items.unlimited({ featureId: TestFeature.Credits }),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [mixedProduct] }),
			],
			actions: [s.attach({ productId: mixedProduct.id })],
		});

		const creditSystem = ctx.features.find((f) => f.id === TestFeature.Credits);
		expect(creditSystem).toBeDefined();

		const trackValue = 5;
		const expectedCreditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditSystem!,
			amount: trackValue,
		});

		const trackRes = (await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: trackValue,
		})) as TrackResponseV3;
		expect(trackRes.customer_id).toBe(customerId);

		const creditsBalance = await pollUntil({
			fetch: async () => {
				const creditsCusEnt = await findCustomerEntitlement({
					ctx,
					customerId,
					featureId: TestFeature.Credits,
				});
				return creditsCusEnt?.balance;
			},
			until: (balance) => balance === -expectedCreditCost,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		expect(creditsBalance).toBe(-expectedCreditCost);

		const actionCusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Action1,
		});
		expect(actionCusEnt?.balance).toBe(includedActionUsage);
	},
	{ timeout: 90_000 },
);

test.concurrent(
	`${chalk.yellowBright("unlimited-aggregate: set_usage 42 with two entities sums to -42, never -42 each")}`,
	async () => {
		const customerId = "unlim-agg-set-usage";

		const entityScopedUnlimitedMessages: ProductItem = {
			...constructFeatureItem({
				featureId: TestFeature.Messages,
				unlimited: true,
			}),
			entity_feature_id: TestFeature.Users,
		};

		const product = products.base({
			id: "unlim-agg-prod",
			items: [entityScopedUnlimitedMessages],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.usage({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 42,
		});

		const entityBalances = await pollUntil({
			fetch: async () => {
				const cusEnt = await findCustomerEntitlement({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				});
				return Object.values(cusEnt?.entities ?? {}).map(
					(entityBalance) => entityBalance.balance,
				);
			},
			until: (balances) =>
				balances.length === 2 &&
				balances.reduce((sum, balance) => sum + balance, 0) === -42,
			timeoutMs: POLL_TIMEOUT_MS,
		});

		const total = entityBalances.reduce((sum, balance) => sum + balance, 0);
		expect(entityBalances).toHaveLength(2);
		expect(total).toBe(-42);
	},
	{ timeout: 90_000 },
);
