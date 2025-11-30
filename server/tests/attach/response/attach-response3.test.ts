import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { initCustomerV3 } from "../../../src/utils/scriptUtils/testUtils/initCustomerV3";

const testCase = "attach-response3";

const pro = constructProduct({
	type: "pro",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 1000,
		}),
	],
});

const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 1000,
		}),
	],
});

describe(`${chalk.yellowBright(`${testCase}: Testing v0.2 / v1.2 response for attach, scenario: downgrade`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});
	});

	test("should return v0.2 responses for attach", async () => {
		const attachResponse = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(Object.keys(attachResponse)).toEqual(["success", "message"]);
	});

	test("should return correct v1.2 responses for attach", async () => {
		const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

		await autumnV1.cancel({
			customer_id: customerId,
			product_id: pro.id,
			cancel_immediately: true,
		});

		const attachResponse = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(attachResponse).toMatchObject({
			customer_id: customerId,
			product_ids: [pro.id],
			code: expect.any(String),
			message: expect.any(String),
		});
	});
});
