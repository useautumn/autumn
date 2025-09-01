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
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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

const testCase = "updateContUse1";

describe(`${chalk.yellowBright(`attach/entities/${testCase}: Testing update contUse, add included usage`)}`, () => {
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
		{
			id: "2",
			name: "test2",
			feature_id: TestFeature.Users,
		},
		{
			id: "3",
			name: "test3",
			feature_id: TestFeature.Users,
		},
	];

	it("should create entity, then attach pro", async () => {
		await autumn.entities.create(customerId, firstEntities);
		usage += 3;

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
					value: usage,
				},
			],
		});
	});

	const extraUsage = 2;
	const newItem = constructArrearProratedItem({
		featureId: TestFeature.Users,
		pricePerUnit: 50,
		includedUsage: (userItem.included_usage as number) + extraUsage,
		config: {
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	return;

	it("should update product with extra included usage", async () => {
		const customItems = replaceItems({
			featureId: TestFeature.Users,
			items: pro.items,
			newItem,
		});

		usage += extraUsage;

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			is_custom: true,
			items: customItems,
		});

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			numReplaceables: extraUsage,
		});

		// Will have 1 invoice because price is replaced...
	});

	const entities = [
		{
			id: "4",
			name: "test4",
			feature_id: TestFeature.Users,
		},
		{
			id: "5",
			name: "test5",
			feature_id: TestFeature.Users,
		},
	];

	it("should create 2 entities and have no invoice", async () => {
		_curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 10,
		});

		await autumn.entities.create(customerId, entities);

		// Usage won't change since using replaceables...
		// usage += entities.length;

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			numReplaceables: 0,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).to.equal(2);
	});
});
