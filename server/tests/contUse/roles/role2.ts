import {
	type AppEnv,
	type CreateEntity,
	LegacyVersion,
	type LimitedItem,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
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

export const pro = constructProduct({
	items: [userMessages],
	type: "pro",
});

const testCase = "role2";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing overages for per entity`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
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

		const customer = await autumn.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].included_usage).to.equal(
			userMessages.included_usage * firstEntities.length,
		);
	});

	const user1Usage = 125000;
	const user2Usage = 150000;
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
	});

	it("should have correct invoice next cycle", async () => {
		await advanceTestClock({
			stripeCli,
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
