import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	CheckResponseV3,
	ProductItem,
	TrackResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(
	`${chalk.yellowBright("unlimited-usage-api: standalone track 7 surfaces usage 7 on check and customer")}`,
	async () => {
		const customerId = "unlim-usage-api-standalone";

		const unlimitedProduct = products.base({
			id: "unlim-usage-api-prod",
			items: [items.unlimitedMessages()],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedProduct] }),
			],
			actions: [s.attach({ productId: unlimitedProduct.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 7,
		});

		const checkRes = (await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV3;
		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance?.unlimited).toBe(true);
		expect(checkRes.balance?.usage).toBe(7);
		expect(checkRes.balance?.remaining).toBe(0);
		expect(checkRes.balance?.granted).toBe(0);

		const breakdown = checkRes.balance?.breakdown ?? [];
		expect(breakdown).toHaveLength(1);
		expect(breakdown[0]).toMatchObject({
			unlimited: true,
			usage: 7,
			remaining: 0,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			usage: 7,
			remaining: 0,
			granted: 0,
		});
	},
	{ timeout: 90_000 },
);

test.concurrent(
	`${chalk.yellowBright("unlimited-usage-api: resident-feature track surfaces usage in credit units")}`,
	async () => {
		const customerId = "unlim-usage-api-credits";

		const unlimitedCreditsProduct = products.base({
			id: "unlim-usage-api-credits-prod",
			items: [items.unlimited({ featureId: TestFeature.Credits })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedCreditsProduct] }),
			],
			actions: [s.attach({ productId: unlimitedCreditsProduct.id })],
		});

		const creditSystem = ctx.features.find((f) => f.id === TestFeature.Credits);
		expect(creditSystem).toBeDefined();

		const trackValue = 5;
		const expectedCreditUsage = getCreditCost({
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

		const checkRes = (await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		})) as unknown as CheckResponseV3;
		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance?.unlimited).toBe(true);
		expect(checkRes.balance?.usage).toBe(expectedCreditUsage);
		expect(checkRes.balance?.remaining).toBe(0);
		expect(checkRes.balance?.granted).toBe(0);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Credits]).toMatchObject({
			unlimited: true,
			usage: expectedCreditUsage,
			remaining: 0,
			granted: 0,
		});
	},
	{ timeout: 90_000 },
);

test.concurrent(
	`${chalk.yellowBright("unlimited-usage-api: entity-scoped track shows per-entity usage, customer view sums")}`,
	async () => {
		const customerId = "unlim-usage-api-entity";

		const entityScopedUnlimitedMessages: ProductItem = {
			...constructFeatureItem({
				featureId: TestFeature.Messages,
				unlimited: true,
			}),
			entity_feature_id: TestFeature.Users,
		};

		const product = products.base({
			id: "unlim-usage-api-entity-prod",
			items: [entityScopedUnlimitedMessages],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Messages,
			value: 4,
		});

		const entity1Check = (await autumnV2_3.check({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV3;
		expect(entity1Check.allowed).toBe(true);
		expect(entity1Check.balance?.unlimited).toBe(true);
		expect(entity1Check.balance?.usage).toBe(4);
		expect(entity1Check.balance?.remaining).toBe(0);

		const entity1 = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			"ent-1",
		);
		expect(entity1.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			usage: 4,
			remaining: 0,
		});

		const entity2Check = (await autumnV2_3.check({
			customer_id: customerId,
			entity_id: "ent-2",
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV3;
		expect(entity2Check.balance?.unlimited).toBe(true);
		expect(entity2Check.balance?.usage).toBe(0);

		const entity2 = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			"ent-2",
		);
		expect(entity2.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			usage: 0,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			remaining: 0,
			granted: 0,
		});
		expect(
			customer.balances[TestFeature.Messages]?.usage,
		).toBeGreaterThanOrEqual(0);
	},
	{ timeout: 90_000 },
);
