import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

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

	before(async function () {
		await setupBefore(this);
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		await initCustomer({
			db,
			org,
			env,
			autumn: this.autumnJs,
			customerId,
			fingerprint: "test",
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro, addOn],
			prefix: testCase,
		});

		await createProducts({
			db,
			orgId: org.id,
			env,
			autumn,
			products: [pro, addOn],
		});
	});

	it("should attach pro product and free add on", async () => {
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
