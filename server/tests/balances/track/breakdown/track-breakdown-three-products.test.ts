import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test 1.4: Three products with same feature
 * - Product A: 100 messages (monthly)
 * - Product B: 50 messages (monthly)
 * - Product C: 200 messages (lifetime)
 * - Customer should have 350 total with 3 breakdown items
 */

const messagesItemA = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const messagesItemB = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: ProductItemInterval.Month,
});

const messagesItemC = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: ProductItemInterval.Lifetime,
});

const productA = constructProduct({
	type: "free",
	id: "prod-a",
	isDefault: false,
	items: [messagesItemA],
});

const productB = constructProduct({
	type: "free",
	id: "prod-b",
	isDefault: false,
	isAddOn: true,
	items: [messagesItemB],
});

const productC = constructProduct({
	type: "free",
	id: "prod-c",
	isDefault: false,
	isAddOn: true,
	items: [messagesItemC],
});

const testCase = "track-breakdown-three-products";

describe(`${chalk.yellowBright("track-breakdown-three-products: 3 products same feature")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [productA, productB, productC],
			prefix: testCase,
		});

		// Attach all three products
		await autumnV2.attach({ customer_id: customerId, product_id: productA.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productB.id });
		await autumnV2.attach({ customer_id: customerId, product_id: productC.id });
	});

	test("initial: customer has 350 with 3 breakdown items", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 350,
			current_balance: 350,
			usage: 0,
		});

		// Should have 3 breakdown items
		expect(res.balance?.breakdown).toHaveLength(3);

		// Verify each breakdown exists with correct values
		const breakdowns = res.balance?.breakdown ?? [];
		const balances = breakdowns.map((b) => b.granted_balance).sort((a, b) => (a ?? 0) - (b ?? 0));
		expect(balances).toEqual([50, 100, 200]);

		// All breakdown IDs should be unique
		const ids = breakdowns.map((b) => b.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(3);
	});

	test("track 120: should deplete across multiple breakdowns", async () => {
		// Track 120 - should deplete monthly breakdowns first (100 + 50), leaving 30 from lifetime
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 350,
			current_balance: 230,
			usage: 120,
		});

		// Check breakdown state
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance?.breakdown).toHaveLength(3);

		// Sum of breakdown current_balances should equal total
		const breakdownSum =
			res.balance?.breakdown?.reduce((sum, b) => sum + (b.current_balance ?? 0), 0) ?? 0;
		expect(breakdownSum).toBe(230);

		// Sum of breakdown usages should equal total usage
		const usageSum =
			res.balance?.breakdown?.reduce((sum, b) => sum + (b.usage ?? 0), 0) ?? 0;
		expect(usageSum).toBe(120);
	});

	test("track 200 more: should deplete remaining monthly and into lifetime", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 350,
			current_balance: 30,
			usage: 320,
		});

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// Sum should still match
		const breakdownSum =
			res.balance?.breakdown?.reduce((sum, b) => sum + (b.current_balance ?? 0), 0) ?? 0;
		expect(breakdownSum).toBe(30);
	});
});

