import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "attach-misc2";

const pro = constructProduct({
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			includedUsage: 1000,
		}),
	],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing attach race condition`)}`, () => {
	const customerId = testCase;
	const entityId = "entity-1";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		// Delete customer if exists
		try {
			await autumn.customers.delete(customerId);
		} catch {
			// Ignore if customer doesn't exist
		}

		// Initialize products
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	test("should auto-create customer and entity when calling attach", async () => {
		// Attach with customer_data and entity_data to auto-create both
		const responses = await Promise.allSettled([
			autumn.attach({
				customer_id: customerId,
				product_id: pro.id,
			}),
			autumn.attach({
				customer_id: customerId,
				product_id: pro.id,
			}),
		]);

		console.log("Responses:", responses);
	});
});
