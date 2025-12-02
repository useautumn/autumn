import { beforeAll, describe, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const premium = constructProduct({
	type: "premium",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 50,
		}),
	],
});

const free = constructProduct({
	type: "free",
	isDefault: true,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing entity prorated")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

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
			products: [premium, pro, free],
			prefix: customerId,
		});

		await autumn.entities.create(customerId, [
			{
				id: "1",
				name: "test",
				feature_id: TestFeature.Users,
			},
		]);
	});

	test("should create a subscription with prepaid and prorated", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});
});
