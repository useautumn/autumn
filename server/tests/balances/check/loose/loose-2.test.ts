import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check-loose2";

describe(`${chalk.yellowBright("check-loose2: unlimited loose entitlement check")}`, () => {
	const customerId = "check-loose2";
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		// Create unlimited loose entitlement
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			unlimited: true,
		});
	});

	test("v2: unlimited loose entitlement should always be allowed", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.customer_id).toBe(customerId);
		expect(res.balance).toBeDefined();
		expect(res.balance?.plan_id).toBeNull();
		expect(res.balance?.feature_id).toBe(TestFeature.Users);
		expect(res.balance?.unlimited).toBe(true);
	});

	test("v2: unlimited should allow any required_balance", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			required_balance: 999999,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.balance?.unlimited).toBe(true);
	});
});
