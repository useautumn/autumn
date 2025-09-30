import { APIVersion, type AppEnv, type Organization } from "@autumn/shared";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

// UNCOMMENT FROM HERE
const pro = constructProduct({
	id: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});
const premium = constructProduct({
	id: "premium",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});
const growth = constructProduct({
	id: "growth",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "growth",
});

describe(`${chalk.yellowBright("upgrade1: Testing usage upgrades")}`, () => {
	const customerId = "upgrade1";
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

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

		addPrefixToProducts({
			products: [pro, premium, growth],
			prefix: customerId,
		});

		await createProducts({
			autumn: autumnJs,
			products: [pro, premium, growth],
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

	it("should attach pro product", async () => {
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

	it("should attach premium product", async () => {
		const wordsUsage = 100000;
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: wordsUsage,
		});

		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 10,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should attach growth product", async () => {
		const wordsUsage = 200000;
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: wordsUsage,
		});

		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 10,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: growth,
			stripeCli,
			db,
			org,
			env,
		});
	});
});
