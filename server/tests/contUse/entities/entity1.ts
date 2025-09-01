import {
	APIVersion,
	type AppEnv,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../../attach/utils.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "entity1";

// Pro is $20 / month, Seat is $50 / user

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing create / delete entities`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let _curUnix = Date.now();

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

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = testClockId1!;
	});

	let usage = 0;
	const firstEntities = [
		{
			id: "1",
			name: "test",
			feature_id: TestFeature.Users,
		},
	];

	it("should create entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += 1;

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
			usage: [
				{
					featureId: TestFeature.Users,
					value: 1,
				},
			],
		});
	});

	const entities = [
		{
			id: "2",
			name: "test",
			feature_id: TestFeature.Users,
		},
		{
			id: "3",
			name: "test2",
			feature_id: TestFeature.Users,
		},
	];

	it("should create 2 entities and have correct invoice", async () => {
		_curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 30,
		});

		await autumn.entities.create(customerId, entities);
		await timeout(3000);

		usage += entities.length;

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			itemQuantity: usage,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices!;
		expect(invoices.length).to.equal(2);
		expect(invoices[0].total).to.equal(userItem.price! * entities.length);
	});

	it("should delete 1 entity and have no new invoice", async () => {
		await autumn.entities.delete(customerId, entities[0].id);

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices!;
		expect(invoices.length).to.equal(2);

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			numReplaceables: 1,
			itemQuantity: usage - 1,
		});
	});

	const newEntities = [
		{
			id: "4",
			name: "test3",
			feature_id: TestFeature.Users,
		},
		{
			id: "5",
			name: "test4",
			feature_id: TestFeature.Users,
		},
	];

	it("should create 2 entities and have correct invoice (only pay for 1)", async () => {
		await autumn.entities.create(customerId, newEntities);
		await timeout(3000);
		usage += 1;

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices!;

		expect(invoices.length).to.equal(3);
		expect(invoices[0].total).to.equal(userItem.price!);

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			itemQuantity: usage,
		});
	});
});
