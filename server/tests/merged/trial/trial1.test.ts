import {
	type AppEnv,
	AttachBranch,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// Premium, Premium
// Cancel End, Cancel Immediately
// Results: Canceled sub

const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
	trial: true,
});

const ops = [
	{
		product: pro,
		results: [{ product: pro, status: CusProductStatus.Trialing }],
	},
	// {
	//   entityId: "2",
	//   product: premium,
	//   results: [{ product: premium, status: CusProductStatus.Active }],
	// },
];

const testCase = "trial1";
describe(`${chalk.yellowBright("trial1: Testing main trial branch, upgrade from pro trial -> premium trial")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	beforeAll(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium],
			db,
			orgId: org.id,
			env,
			customerId,
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

	it("should attach first trial, and advance clock past trial", async () => {
		for (const op of ops) {
			await attachAndExpectCorrect({
				autumn,
				customerId,
				product: op.product,
				stripeCli,
				db,
				org,
				env,
			});
		}

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Trialing,
		});
	});

	it("should advance test clock to before trial ends and attach premium", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 2).getTime(),
		});
		// return;

		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: premium.id,
		});

		expect(attachPreview?.branch).to.equal(AttachBranch.MainIsTrial);

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: premium,
			status: CusProductStatus.Trialing,
		});
		const product = customer.products.find((p) => p.id === premium.id)!;
		expect(product.current_period_end).to.be.approximately(
			addDays(curUnix, 7).getTime(),
			1000 * 60 * 30, // 30 minutes
		);

		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	});
});
