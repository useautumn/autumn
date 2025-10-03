import {
	APIVersion,
	type AppEnv,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
	calcProrationAndExpectInvoice,
	expectSubQuantityCorrect,
} from "tests/utils/expectUtils/expectContUseUtils.js";
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
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
});

const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "entity2";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing entities, prorate now`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let curUnix = Date.now();

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
					value: usage,
				},
			],
		});
	});

	const newEntities = [
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
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 30,
		});

		await autumn.entities.create(customerId, newEntities);
		usage += newEntities.length;

		const { stripeSubs } = await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
			itemQuantity: usage,
		});

		await timeout(5000);

		await calcProrationAndExpectInvoice({
			autumn,
			stripeSubs,
			customerId,
			quantity: newEntities.length,
			unitPrice: userItem.price!,
			curUnix,
			numInvoices: 2,
		});
	});

	it("should delete 1 entity and have correct invoice amount", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 30,
		});

		await timeout(5000);

		await autumn.entities.delete(customerId, newEntities[0].id);
		usage -= 1;

		const { stripeSubs } = await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});

		await calcProrationAndExpectInvoice({
			autumn,
			stripeSubs,
			customerId,
			quantity: -1,
			unitPrice: userItem.price!,
			curUnix,
			numInvoices: 3,
		});
	});
});
