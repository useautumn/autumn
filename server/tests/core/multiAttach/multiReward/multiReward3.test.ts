import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { expectMultiAttachCorrect } from "tests/utils/expectUtils/expectMultiAttach.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	premiumReward,
	premiumTrial,
	proReward,
	proTrial,
	setupMultiRewardBefore,
} from "./multiRewardUtils.test.js";

const testCase = "multiReward3";
describe(`${chalk.yellowBright("multiReward3: Testing multi attach with rewards -- advance clock and update pro quantity")}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	let stripeCli: Stripe;
	let testClockId: string;
	let curUnix: number;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		await setupMultiRewardBefore({
			orgId: org.id,
			db,
			env,
		});

		testClockId = testClockId1!;
	});

	it("should run multi attach through checkout and have correct sub", async () => {
		const productsList = [
			{
				product_id: proTrial.id,
				quantity: 3,
				product: proTrial,
				status: CusProductStatus.Trialing,
			},
			{
				product_id: premiumTrial.id,
				quantity: 3,
				product: premiumTrial,
				status: CusProductStatus.Trialing,
			},
		];
		await expectMultiAttachCorrect({
			customerId,
			products: productsList,
			results: productsList,
			db,
			org,
			env,
			rewards: [proReward.id, premiumReward.id],
			expectedRewards: [proReward.id, premiumReward.id],
		});
	});

	let checkoutRes: any;

	it("should advance clock and update pro quantity", async () => {
		const productsList = [
			{
				product_id: proTrial.id,
				quantity: 5,
				product: proTrial,
				status: CusProductStatus.Trialing,
			},
		];

		const results = [
			{
				product: proTrial,
				quantity: 5,
				status: CusProductStatus.Trialing,
			},
			{
				product: premiumTrial,
				quantity: 3,
				status: CusProductStatus.Trialing,
			},
		];
		const res = await expectMultiAttachCorrect({
			customerId,
			products: productsList,
			results,
			db,
			org,
			env,
			rewards: [proReward.id, premiumReward.id],
			expectedRewards: [proReward.id, premiumReward.id],
		});

		checkoutRes = res.checkoutRes;
	});

	it("should advance to trial end and have correct quantity", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addDays(new Date(), 12).getTime(),
			waitForSeconds: 30,
		});

		await expectSubToBeCorrect({
			customerId,
			db,
			org,
			env,
			// sub: curSub,
			// cusProduct: curMainProduct,
			// results: productsList,
		});

		const customer = await autumn.customers.get(customerId);
		const latestInvoice = customer.invoices[0];

		const checkoutNextCycleTotal = checkoutRes.next_cycle?.total;
		const premiumPrice = new Decimal(getBasePrice({ product: premiumTrial }))
			.mul(3)
			.mul(0.2)
			.toNumber();

		console.log("Premium price: ", premiumPrice);
		console.log("Checkout next cycle total: ", checkoutNextCycleTotal);
		expect(latestInvoice.total).to.equal(
			checkoutRes.next_cycle?.total + premiumPrice,
		);
	});
});
