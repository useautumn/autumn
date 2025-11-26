import { beforeAll, describe, test } from "bun:test";
import { BillingInterval, LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

export const free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	isDefault: false,
	type: "free",
	id: "free",
});
// export let addOn = constructProduct({
//   items: [
//     constructFeatureItem({
//       featureId: TestFeature.Credits,
//       includedUsage: 1000,
//     }),
//   ],
//   isDefault: false,
//   type: "free",
//   isAddOn: true,
//   id: "add_on",
// });
const testCase = "free2";

describe(`${chalk.yellowBright(`${testCase}: Testing free product with trial and attaching add on`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
		});
	});

	const approximateDiff = 1000 * 60 * 30; // 30 minutes
	test("should attach free product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: free,
		});
	});

	const customItems = [
		...free.items,
		constructPriceItem({
			price: 100,
			interval: BillingInterval.Month,
		}),
	];
	test("should update free product with price", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: free,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			attachParams: {
				// @ts-expect-error
				is_custom: true,
				items: customItems,
			},
		});
	});
});
