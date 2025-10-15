import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

export const oneOff = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Users,
			includedUsage: 5,
		}),
	],
	type: "one_off",
	isAddOn: true,
});

const testCase = "checkout3";
describe(`${chalk.yellowBright(`${testCase}: Testing multi attach checkout, pro + one off`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	const curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, oneOff],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, oneOff],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			// attachPm: "success",
		});

		testClockId = testClockId1!;
	});

	it("should attach pro and one off product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_ids: [pro.id, oneOff.id],
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(10000);

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});
		expectProductAttached({
			customer,
			product: oneOff,
		});

		expectFeaturesCorrect({
			customer,
			product: pro,
		});

		expectFeaturesCorrect({
			customer,
			product: oneOff,
		});
	});
});
