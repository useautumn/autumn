import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ResetInterval,
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
 * Sleep until a specific epoch time in milliseconds
 */
function sleepUntil(epochMs: number): Promise<void> {
	const delay = epochMs - Date.now();

	if (delay <= 0) {
		return Promise.resolve();
	}

	return new Promise((resolve) => setTimeout(resolve, delay));
}

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check-loose-expiry";

describe(`${chalk.yellowBright(`${testCase}: expiring loose entitlement check`)}`, () => {
	const customerBasic = `${testCase}-basic`;
	const customerProductMix = `${testCase}-prod`;
	const customerResetMix = `${testCase}-reset`;

	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		// Setup products
		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		// Setup customers only
		await initCustomerV3({
			ctx,
			customerId: customerBasic,
			withTestClock: false,
		});

		await initCustomerV3({
			ctx,
			customerId: customerProductMix,
			withTestClock: false,
		});

		await initCustomerV3({
			ctx,
			customerId: customerResetMix,
			withTestClock: false,
		});
	});

	test("basic: expiring loose entitlement should be allowed before expiry, then denied after", async () => {
		const expiresAt = Date.now() + 3000;

		// Create expiring loose entitlement
		await autumnV1.balances.create({
			customer_id: customerBasic,
			feature_id: TestFeature.Messages,
			granted_balance: 500,
			expires_at: expiresAt,
		});

		// Check before expiry
		const resBefore = (await autumnV2.check({
			customer_id: customerBasic,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(resBefore.allowed).toBe(true);
		expect(resBefore.customer_id).toBe(customerBasic);
		expect(resBefore.balance).toBeDefined();
		expect(resBefore.balance?.plan_id).toBeNull();
		expect(resBefore.balance?.feature_id).toBe(TestFeature.Messages);
		expect(resBefore.balance?.granted_balance).toBe(500);
		expect(resBefore.balance?.current_balance).toBe(500);
		expect(resBefore.balance?.usage).toBe(0);
		expect(resBefore.balance?.unlimited).toBe(false);

		// Wait until expiry
		await sleepUntil(expiresAt + 1000);

		// Check after expiry
		const resAfter = (await autumnV2.check({
			customer_id: customerBasic,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(resAfter.allowed).toBe(false);
		expect(resAfter.balance).toBeNull();
	});

	test("product-mix: should combine product and expiring loose ent, then only product after expiry", async () => {
		const expiresAt = Date.now() + 3000;

		// Attach product with 100 messages
		await autumnV1.attach({
			customer_id: customerProductMix,
			product_id: freeProd.id,
		});

		// Create expiring loose entitlement with 200 messages
		await autumnV1.balances.create({
			customer_id: customerProductMix,
			feature_id: TestFeature.Messages,
			granted_balance: 200,
			expires_at: expiresAt,
		});

		// Check before expiry
		const resBefore = (await autumnV2.check({
			customer_id: customerProductMix,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(resBefore.allowed).toBe(true);
		expect(resBefore.balance?.granted_balance).toBe(300); // 100 from product + 200 from loose
		expect(resBefore.balance?.current_balance).toBe(300);

		// Wait until expiry
		await sleepUntil(expiresAt + 1000);

		// Check after expiry
		const resAfter = (await autumnV2.check({
			customer_id: customerProductMix,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(resAfter.allowed).toBe(true);
		expect(resAfter.balance?.granted_balance).toBe(100); // Only product balance remains
		expect(resAfter.balance?.current_balance).toBe(100);
	});

	test("reset-mix: should combine expiring and resetting loose ents, then only resetting after expiry", async () => {
		const expiresAt = Date.now() + 3000;

		// Create expiring loose entitlement
		await autumnV1.balances.create({
			customer_id: customerResetMix,
			feature_id: TestFeature.Messages,
			granted_balance: 200,
			expires_at: expiresAt,
		});

		// Create resetting loose entitlement (no expiry)
		await autumnV1.balances.create({
			customer_id: customerResetMix,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
			reset: {
				interval: ResetInterval.Month,
			},
		});

		// Check before expiry
		const resBefore = (await autumnV2.check({
			customer_id: customerResetMix,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(resBefore.allowed).toBe(true);
		expect(resBefore.balance?.granted_balance).toBe(300); // 200 expiring + 100 resetting
		expect(resBefore.balance?.current_balance).toBe(300);

		// Wait until expiry
		await sleepUntil(expiresAt + 1000);

		// Check after expiry
		const resAfter = (await autumnV2.check({
			customer_id: customerResetMix,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(resAfter.allowed).toBe(true);
		expect(resAfter.balance?.granted_balance).toBe(100); // Only resetting balance remains
		expect(resAfter.balance?.current_balance).toBe(100);
		expect(resAfter.balance?.reset).toBeDefined();
		expect(resAfter.balance?.reset?.interval).toBe(ResetInterval.Month);
	});
});
