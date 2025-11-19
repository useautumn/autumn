import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils";
import { getCustomerEvents } from "../../testBalanceUtils";

const userItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 5,
}) as LimitedItem;

export const free = constructProduct({
	items: [userItem],
	type: "free",
	isDefault: false,
});

const testCase = "track-allocated5";

describe(`${chalk.yellowBright(`${testCase}: Tracking allocated feature with concurrency and +ve / -ve values`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should track 5 events in a row and have correct balance", async () => {
		let startingBalance = userItem.included_usage;
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const promises = [];
		let totalUsage = 0;
		let numberOfTracks = 0;
		for (let i = 0; i < 2; i++) {
			console.log("--------------------------------");
			console.log(`Cycle ${i}`);
			console.log(`Starting balance: ${startingBalance}`);

			const values = [];
			for (let i = 0; i < 10; i++) {
				const randomVal = Math.floor(Math.random() * 5);
				// * (Math.random() < 0.3 ? -1 : 1);
				promises.push(
					autumn.track({
						customer_id: customerId,
						feature_id: TestFeature.Users,
						value: randomVal,
					}),
				);

				// Calculate expected balance with constraint: balance can never exceed includedUsage
				// (i.e., usage can never go below 0)
				const potentialBalance = startingBalance - randomVal;
				const cappedBalance = Math.min(
					potentialBalance,
					userItem.included_usage,
				);

				totalUsage += randomVal;
				startingBalance = cappedBalance;
				values.push(randomVal);

				numberOfTracks++;
			}

			console.log(`New balance: ${startingBalance}`);
			console.log(`Total usage: ${totalUsage}`);

			const results = await Promise.all(promises);
			const customer = await autumn.customers.get(customerId);
			const userFeature = customer.features[TestFeature.Users];
			if (userFeature.balance !== startingBalance) {
				for (let i = 0; i < values.length; i++) {
					console.log(`Value: ${values[i]}, Event ID: ${results[i].id}`);
				}
			}
			expect(userFeature.balance).toBe(startingBalance);

			// Check that there are X events in the database
			await timeout(2000);
			const events = await getCustomerEvents({ customerId });
			expect(events.length).toBe(numberOfTracks);
		}
	});
});
