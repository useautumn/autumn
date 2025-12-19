import { beforeAll, describe, it } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase = "attach-misc3";

describe(`${chalk.yellowBright("attach-misc3: cache invalidation guard test")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});
	});

	it("should block cache writes when guard is active", async () => {});
});
