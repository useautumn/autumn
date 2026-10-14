import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ProductItemFeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils.js";

const testCase = "track-allocated2";
const customerId = testCase;

const usersItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 10,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	featureType: ProductItemFeatureType.SingleUse,
});

const pro = constructProduct({
	type: "free",
	isDefault: false,
	items: [usersItem, messagesItem],
});

describe(`${chalk.yellowBright(
	`track-allocated2: Concurrent tracking of single_use + continuous_use features`,
)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should have initial balances after attach", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const usersBalance = customer.features[TestFeature.Users].balance;
		const messagesBalance = customer.features[TestFeature.Messages].balance;

		expect(usersBalance).toBe(10);
		expect(messagesBalance).toBe(50);
	});

	test("should handle concurrent tracks for both single_use and continuous_use features", async () => {
		const usersTracks = Array.from({ length: 5 }, () =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
		);

		const messagesTracks = Array.from({ length: 20 }, () =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			}),
		);

		await Promise.all([...usersTracks, ...messagesTracks]);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const customer = await autumnV1.customers.get(customerId);

		const usersBalance = customer.features[TestFeature.Users].balance;
		const messagesBalance = customer.features[TestFeature.Messages].balance;

		expect(usersBalance).toBe(5);
		expect(messagesBalance).toBe(30);
		const usersCheck = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		});
		const messagesCheck = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(usersCheck.balance).toBe(5);
		expect(messagesCheck.balance).toBe(30);

		await timeout(2000);
		const nonCachedCustomer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedUsersBalance =
			nonCachedCustomer.features[TestFeature.Users].balance;
		const nonCachedMessagesBalance =
			nonCachedCustomer.features[TestFeature.Messages].balance;

		expect(nonCachedUsersBalance).toBe(5);
		expect(nonCachedMessagesBalance).toBe(30);
	});

	test("should handle more concurrent mixed tracks", async () => {
		const usersTracks = Array.from({ length: 3 }, () =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: 1,
			}),
		);

		const messagesTracks = Array.from({ length: 15 }, () =>
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 1,
			}),
		);

		await Promise.all([...usersTracks, ...messagesTracks]);

		await new Promise((resolve) => setTimeout(resolve, 1000));

		const customer = await autumnV1.customers.get(customerId);
		const usersBalance = customer.features[TestFeature.Users].balance;
		const messagesBalance = customer.features[TestFeature.Messages].balance;

		expect(usersBalance).toBe(2);
		expect(messagesBalance).toBe(15);
		const usersCheck = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		});
		const messagesCheck = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(usersCheck.balance).toBe(2);
		expect(messagesCheck.balance).toBe(15);

		await timeout(2000);
		const nonCachedCustomer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedUsersBalance =
			nonCachedCustomer.features[TestFeature.Users].balance;
		const nonCachedMessagesBalance =
			nonCachedCustomer.features[TestFeature.Messages].balance;

		expect(nonCachedUsersBalance).toBe(2);
		expect(nonCachedMessagesBalance).toBe(15);
	});

	test("should maintain consistency across multiple concurrent batches", async () => {
		const wave1 = [
			...Array.from({ length: 2 }, () =>
				autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 1,
				}),
			),
			...Array.from({ length: 10 }, () =>
				autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
				}),
			),
		];

		await Promise.all(wave1);
		await timeout(7000);

		const customer = await autumnV1.customers.get(customerId);
		const usersBalance = customer.features[TestFeature.Users].balance;
		const messagesBalance = customer.features[TestFeature.Messages].balance;

		expect(usersBalance).toBe(0);
		expect(messagesBalance).toBe(5);
		const usersCheck = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		});
		const messagesCheck = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(usersCheck.balance).toBe(0);
		expect(messagesCheck.balance).toBe(5);
	});
});
