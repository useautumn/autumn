import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "attach-response1";

const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1000,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing v0.2 response for attach, scenario: new`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});
	});

	test("should return v0.2 responses for attach", async () => {
		const attachResponse = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(attachResponse.checkout_url).toBeDefined();
		expect(Object.keys(attachResponse)).toEqual(["checkout_url"]);
	});

	test("should return correct v1.2 responses for attach", async () => {
		const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
		const attachResponse = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(attachResponse).toMatchObject({
			customer_id: customerId,
			product_ids: [pro.id],
			checkout_url: expect.any(String),
		});
		expect(attachResponse.code).toBeDefined();
		expect(attachResponse.message).toBeDefined();
		expect(attachResponse.message).toBeDefined();
	});
});
