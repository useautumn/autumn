import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	const curUnix = new Date().getTime();

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = testClockId1!;
	});

	test("should track 5 events in a row and have correct balance", async () => {
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
			if (userFeature.balance != startingBalance) {
				for (let i = 0; i < values.length; i++) {
					console.log(`Value: ${values[i]}, Event ID: ${results[i].id}`);
				}
			}
			expect(userFeature.balance).toBe(startingBalance);
		}
	});
});
