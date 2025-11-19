import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectAutumnError } from "../../../utils/expectUtils/expectErrUtils";

const testCase = "track-allocated6";
const customerId = testCase;

const pro = constructProduct({
	type: "free",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 5,
		}),
	],
});

describe(`${chalk.yellowBright(`${testCase}: Tracking allocated feature with overage behavior reject`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		// Attach product to customer
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should throw insufficient balance error when overage behavior is reject", async () => {
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () => {
				await autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 6,
					overage_behavior: "reject",
				});
			},
		});

		const curBalance = await autumnV1.customers.get(customerId);
		expect(curBalance.features[TestFeature.Users].balance).toBe(5);
	});
	test("should throw insufficient balance error when overage behavior is reject and skip_cache is true", async () => {
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () => {
				await autumnV1.track(
					{
						customer_id: customerId,
						feature_id: TestFeature.Users,
						value: 6,
						overage_behavior: "reject",
					},
					{
						skipCache: true,
					},
				);
			},
		});

		const curBalance = await autumnV1.customers.get(customerId);
		expect(curBalance.features[TestFeature.Users].balance).toBe(5);
	});
});
