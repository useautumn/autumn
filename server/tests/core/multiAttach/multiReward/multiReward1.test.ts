import {
	type AppEnv,
	CusProductStatus,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectMultiAttachCorrect } from "tests/utils/expectUtils/expectMultiAttach.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
	multiRewardPremium,
	multiRewardPro,
	premiumReward,
	proReward,
	setupMultiRewardBefore,
} from "./multiRewardUtils.test.js";

const testCase = "multiReward1";
describe(`${chalk.yellowBright("multiReward1: Testing multi attach with rewards")}`, () => {
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

		// addPrefixToProducts({
		//   products: [pro, premium, growth],
		//   prefix: testCase,
		// });

		// await createProducts({
		//   autumn: autumnJs,
		//   products: [pro, premium, growth],
		//   db,
		//   orgId: org.id,
		//   env,
		//   customerId,
		// });

		testClockId = testClockId1!;
	});

	it("should run multi attach through checkout and have correct sub", async () => {
		const productsList = [
			{
				product_id: multiRewardPro.id,
				quantity: 3,
				product: multiRewardPro,
				status: CusProductStatus.Active,
			},
			{
				product_id: multiRewardPremium.id,
				quantity: 3,
				product: multiRewardPremium,
				status: CusProductStatus.Active,
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
	return;

	// it("should advance clock and update premium & growth while trialing", async function () {
	//   const newProducts = [
	//     {
	//       product_id: premium.id,
	//       quantity: 1,
	//     },
	//     {
	//       product_id: growth.id,
	//       quantity: 5,
	//     },
	//   ];

	//   const results = [
	//     {
	//       product: pro,
	//       quantity: 5,
	//       status: CusProductStatus.Trialing,
	//     },
	//     {
	//       product: premium,
	//       quantity: 1,
	//       status: CusProductStatus.Trialing,
	//     },

	//     {
	//       product: growth,
	//       quantity: 5,
	//       status: CusProductStatus.Trialing,
	//     },
	//   ];

	//   await advanceTestClock({
	//     stripeCli,
	//     testClockId,
	//     advanceTo: addDays(new Date(), 3).getTime(),
	//   });

	//   await expectMultiAttachCorrect({
	//     customerId,
	//     products: newProducts,
	//     results,
	//     db,
	//     org,
	//     env,
	//   });
	// });
});
