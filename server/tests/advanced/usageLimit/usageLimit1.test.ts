import { beforeAll, describe, expect, test } from "bun:test";
import { ErrCode, LegacyVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 0,
	usageLimit: 2,
}) as LimitedItem;

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "usageLimit1";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for entities`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
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

	const entities = [
		{
			id: "1",
			name: "Entity 1",
			feature_id: TestFeature.Users,
		},
		{
			id: "2",
			name: "Entity 2",
			feature_id: TestFeature.Users,
		},
		{
			id: "3",
			name: "Entity 3",
			feature_id: TestFeature.Users,
		},
		{
			id: "4",
			name: "Entity 4",
			feature_id: TestFeature.Users,
		},
	];

	test("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});
	test("should create more entities than the limit and hit error", async () => {
		await expectAutumnError({
			errCode: ErrCode.FeatureLimitReached,
			func: async () => {
				await autumn.entities.create(customerId, entities);
			},
		});
	});

	test("should create entities one by one, then hit usage limit", async () => {
		await autumn.entities.create(customerId, entities[0]);
		await autumn.entities.create(customerId, entities[1]);

		await expectAutumnError({
			errCode: ErrCode.FeatureLimitReached,
			func: async () => {
				await autumn.entities.create(customerId, entities[2]);
			},
		});
	});

	test("should have correct check and get customer value", async () => {
		const check = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Users,
		});
		const customer = await autumn.customers.get(customerId);

		expect(check.balance).toBe(-2);

		expect(check.usage_limit).toBe(userItem.usage_limit!);

		expect(customer.features[TestFeature.Users].usage_limit).toBe(
			userItem.usage_limit!,
		);
	});
});
