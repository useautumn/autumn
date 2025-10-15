import {
	type AppEnv,
	BillingInterval,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

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
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const curUnix = new Date().getTime();
	const numUsers = 0;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [free],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	const approximateDiff = 1000 * 60 * 30; // 30 minutes
	it("should attach free product", async () => {
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
	it("should update free product with price", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: free,
			db,
			org,
			env,
			attachParams: {
				// @ts-expect-error
				is_custom: true,
				items: customItems,
			},
		});
	});
});
