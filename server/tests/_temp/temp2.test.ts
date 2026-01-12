import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
			price: 0.1,
			billingUnits: 1,
		}),
	],
});

describe(`${chalk.yellowBright("temp2: Testing pay-per-use with raw balance")}`, () => {
	const customerId = "temp2";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: customerId,
		});
	});

	test("should attach product and create raw balance", async () => {
		// Attach product with pay-per-use feature (5 messages included)
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		// Create a raw balance of 5 messages
		await autumn.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: "5",
		});
	});
});
