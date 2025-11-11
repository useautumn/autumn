import { beforeAll, describe, expect, test } from "bun:test";
import {
	type CreateEntityParams,
	LegacyVersion,
	type LimitedItem,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const user = TestFeature.Users;
const admin = TestFeature.Admin;

const userMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	entityFeatureId: user,
}) as LimitedItem;

export const pro = constructProduct({
	items: [userMessages],
	type: "pro",
});

const testCase = "role2";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing overages for per entity`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = res.testClockId!;
	});

	const user1 = "user1";
	const user2 = "user2";

	const firstEntities: CreateEntityParams[] = [
		{
			id: user1,
			name: "test",
			feature_id: user,
		},
		{
			id: user2,
			name: "test",
			feature_id: user,
		},
	];

	test("should create initial entities, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			entities: firstEntities,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].included_usage).toBe(
			userMessages.included_usage * firstEntities.length,
		);
	});

	const user1Usage = 125000;
	const user2Usage = 150000;
	test("should track correct usage for seat messages", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: user1Usage,
			entity_id: user1,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: user2Usage,
			entity_id: user2,
		});

		await timeout(4000);

		const includedUsage = userMessages.included_usage;

		const { balance: userBalance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: user1,
		});

		expect(userBalance).toBe(includedUsage - user1Usage);

		const { balance: user2Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: user2,
		});

		expect(user2Balance).toBe(includedUsage - user2Usage);
	});

	test("should have correct invoice next cycle", async () => {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const includedUsage = userMessages.included_usage;
		const user1Overage = user1Usage - includedUsage;
		const user2Overage = user2Usage - includedUsage;

		const totalUsage = user1Overage + user2Overage + includedUsage;

		const expectedInvoiceTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: pro.id,
			usage: [{ featureId: TestFeature.Messages, value: totalUsage }],
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			expectExpired: true,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices[0].total).toBe(expectedInvoiceTotal);
	});
});
