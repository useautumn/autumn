import { beforeAll, describe, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

export const pro = constructProduct({
	type: "pro",
	items: [],
});

export const addOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
		}),
	],
});

const testCase = "addOn2";

describe(`${chalk.yellowBright(`${testCase}: Testing attach free add on twice (should be treated as one off?)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;
		stripeCli = ctx.stripeCli;

		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, addOn],
			prefix: testCase,
		});
	});

	test("should attach pro product and free add on", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			skipSubCheck: true,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: addOn,
		});

		expectFeaturesCorrect({
			customer,
			product: addOn,
		});
	});
});
