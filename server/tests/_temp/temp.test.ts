import { beforeAll, describe, it } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { attachAuthenticatePaymentMethod } from "../../src/external/stripe/stripeCusUtils";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3";

const testCase = "temp";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 12,
		}),
	],
});
const oneOffCredits = constructProduct({
	type: "one_off",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 100,
		}),
	],
	// trial: true,
});

describe(`${chalk.yellowBright("temp: one off credits test")}`, () => {
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
			products: [pro, oneOffCredits],
			prefix: testCase,
		});
	});

	it("should attach one off credits product", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOffCredits.id,
		});

		await attachAuthenticatePaymentMethod({
			ctx,
			customerId,
		});
	});
});

// await createReward({
// 	db: ctx.db,
// 	orgId: ctx.org.id,
// 	env: ctx.env,
// 	autumn: autumnV1,
// 	reward,
// 	// productId: pro.id,
// });
