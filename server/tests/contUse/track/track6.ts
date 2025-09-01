import {
	APIVersion,
	type AppEnv,
	type LimitedItem,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const userItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 5,
}) as LimitedItem;

export const free = constructProduct({
	items: [userItem],
	type: "free",
	isDefault: false,
});

const testCase = "track6";

describe(`${chalk.yellowBright(`${testCase}: Testing track cont use, race condition`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let _testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let _stripeCli: Stripe;

	const _curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		_stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [free],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [free],
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
			attachPm: "success",
		});

		_testClockId = testClockId1!;
	});

	it("should track 5 events in a row and have correct balance", async () => {
		let startingBalance = userItem.included_usage;
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const promises = [];
		for (let i = 0; i < 2; i++) {
			console.log("--------------------------------");
			console.log(`Cycle ${i}`);
			console.log(`Starting balance: ${startingBalance}`);
			const values = [];
			for (let i = 0; i < 10; i++) {
				const randomVal =
					Math.floor(Math.random() * 5) * (Math.random() < 0.3 ? -1 : 1);
				promises.push(
					autumn.track({
						customer_id: customerId,
						feature_id: TestFeature.Users,
						value: randomVal,
					}),
				);
				startingBalance -= randomVal;
				values.push(randomVal);
			}

			console.log(`New balance: ${startingBalance}`);

			const results = await Promise.all(promises);

			await timeout(10000);

			const customer = await autumn.customers.get(customerId);
			const userFeature = customer.features[TestFeature.Users];
			if (userFeature.balance !== startingBalance) {
				for (let i = 0; i < values.length; i++) {
					console.log(`Value: ${values[i]}, Event ID: ${results[i].id}`);
				}
			}
			expect(userFeature.balance).to.equal(startingBalance);
		}
	});
});
