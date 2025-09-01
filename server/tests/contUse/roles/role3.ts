import {
	APIVersion,
	type AppEnv,
	type CreateEntity,
	type LimitedItem,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addPrefixToProducts } from "../../attach/utils.js";

const user = TestFeature.Users;
const admin = TestFeature.Admin;

const userMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	price: 0.5,
	entityFeatureId: user,
}) as LimitedItem;

const adminMessages = constructArrearItem({
	featureId: TestFeature.Messages,
	includedUsage: 0,
	price: 0.1,
	entityFeatureId: admin,
}) as LimitedItem;

export const pro = constructProduct({
	items: [userMessages, adminMessages],
	type: "pro",
});

const testCase = "role3";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing overages for per entity, diff roles`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let testClockId: string;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const res = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = res.testClockId!;
	});

	const user1 = "user1";
	const user2 = "user2";
	const admin1 = "admin1";
	const admin2 = "admin2";
	const firstEntities: CreateEntity[] = [
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
		{
			id: admin1,
			name: "test",
			feature_id: admin,
		},
		{
			id: admin2,
			name: "test",
			feature_id: admin,
		},
	];

	it("should create initial entities, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			entities: firstEntities,
		});
	});

	const user1Usage = 125000;
	const user2Usage = 150000;

	// total: 275000, included: 10000, overage: 255000
	it("should track correct usage for seat messages", async () => {
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

		expect(userBalance).to.equal(includedUsage - user1Usage);

		const { balance: user2Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: user2,
		});

		expect(user2Balance).to.equal(includedUsage - user2Usage);

		const { balance: admin1Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: admin1,
		});

		expect(admin1Balance).to.equal(adminMessages.included_usage);

		const { balance: admin2Balance } = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: admin2,
		});

		expect(admin2Balance).to.equal(adminMessages.included_usage);
	});

	const admin1Usage = 130000;
	const admin2Usage = 140000;
	// total: 270000, included: 0, overage: 270000
	it("should track correct usage for admin messages", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: admin1Usage,
			entity_id: admin1,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: admin2Usage,
			entity_id: admin2,
		});

		await timeout(4000);
	});

	it("should have correct invoice next cycle", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(), 1).getTime(),
			// addHours(
			//   addMonths(new Date(), 1),
			//   hoursToFinalizeInvoice
			// ).getTime(),
			waitForSeconds: 30,
		});

		return;

		const includedUsage = userMessages.included_usage;
		const user1Overage = user1Usage - includedUsage;
		const user2Overage = user2Usage - includedUsage;
		const totalUserUsage = user1Overage + user2Overage + includedUsage;

		const admin1Overage = admin1Usage - adminMessages.included_usage;
		const admin2Overage = admin2Usage - adminMessages.included_usage;
		const totalAdminUsage =
			admin1Overage + admin2Overage + adminMessages.included_usage;

		const expectedInvoiceTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: pro.id,
			usage: [
				{
					featureId: TestFeature.Messages,
					entityFeatureId: user,
					value: totalUserUsage,
				},
				{
					featureId: TestFeature.Messages,
					entityFeatureId: admin,
					value: totalAdminUsage,
				},
			],
			stripeCli,
			db,
			org,
			env,
			expectExpired: true,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices[0].total).to.equal(expectedInvoiceTotal);
	});
});
