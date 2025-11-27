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

const testCase = "attach-response5";

const oneOff = constructProduct({
	type: "one_off",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 1000,
			interval: null,
		}),
	],
});

describe(`${chalk.yellowBright(`${testCase}: Testing v0.2 / v1.2 response for attach, scenario: one off (card on file)`)}`, () => {
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
			products: [oneOff],
			prefix: testCase,
		});
	});

	test("should return v0.2 responses for attach", async () => {
		const attachResponse = await autumn.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});

		expect(attachResponse).toMatchObject({
			// customer_id: customerId,
			// product_ids: [oneOff.id],
			// code: expect.any(String),
			success: true,
			message: expect.any(String),
		});
	});

	test("should return correct v1.2 responses for attach", async () => {
		const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

		const attachResponse = await autumnV1.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});

		expect(attachResponse).toMatchObject({
			success: true,
			customer_id: customerId,
			product_ids: [oneOff.id],
			code: expect.any(String),
			message: expect.any(String),
		});
	});
});
