import {
	type AppEnv,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
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

const testCase = "track2";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing track usage for cont use (without overage)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	const curUnix = new Date().getTime();

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
	it("should attach pro", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should track +1 and have no new invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});

		usage += 1;

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).to.equal(1);
	});

	it("should track -1 and have no new invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -1,
		});

		usage -= 1;

		await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});
	});
});
