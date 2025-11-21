import { beforeAll, describe, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	type: "pro",

	items: [
		// constructFeatureItem({
		// 	featureId: TestFeature.Users,
		// 	includedUsage: 5,
		// }),
		// constructFeatureItem({
		// 	featureId: TestFeature.Words,
		// 	includedUsage: 300,
		// }),

		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.5,
		}),

		// constructPrepaidItem({
		// 	featureId: TestFeature.Messages,
		// 	includedUsage: 100,
		// 	price: 10,
		// 	billingUnits: 100,
		// }),
	],
});

const premium = constructProduct({
	type: "premium",

	items: [
		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.5,
		}),
		// constructFeatureItem({
		// 	featureId: TestFeature.Users,
		// 	includedUsage: 5,
		// }),
		// constructFeatureItem({
		// 	featureId: TestFeature.Words,
		// 	includedUsage: 300,
		// }),
		// constructPrepaidItem({
		// 	featureId: TestFeature.Messages,
		// 	includedUsage: 100,
		// 	price: 10,
		// 	billingUnits: 100,
		// }),
		// constructFeatureItem({
		// 	featureId: TestFeature.Words,
		// 	includedUsage: 100,
		// 	entityFeatureId: TestFeature.Users,
		// }) as LimitedItem,
	],
});

describe(`${chalk.yellowBright("temp: Testing add ons")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let testClockId: string;
	beforeAll(async () => {
		const cusId1 = "temp1";
		const cusId2 = "temp2";

		try {
			await autumn.customers.delete(cusId1);
		} catch (_error) {}

		await Promise.all([
			autumn.check({
				customer_id: cusId1,
				feature_id: TestFeature.Messages,
			}),
			autumn.check({
				customer_id: cusId1,
				feature_id: TestFeature.Messages,
			}),
		]);
		return;
		const result = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: customerId,
		});

		testClockId = result.testClockId!;

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.track({
			customer_id: customerId,
			value: 100,
			feature_id: TestFeature.Messages,
		});
	});
	return;

	test("should attach pro product", async () => {});
});
