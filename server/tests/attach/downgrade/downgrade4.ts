import {
	APIVersion,
	type AppEnv,
	BillingInterval,
	type Customer,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
	expectDowngradeCorrect,
	expectNextCycleCorrect,
} from "tests/utils/expectUtils/expectScheduleUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceMonths } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

const testCase = "downgrade4";

const proQuarter = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	interval: BillingInterval.Quarter,
});

const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
});

const premium = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrade: pro-quarter -> premium -> pro`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let _customer: Customer;
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const _curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [proQuarter, pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [proQuarter, pro, premium],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1, customer: customer_ } =
			await initCustomer({
				autumn: autumnJs,
				customerId,
				db,
				org,
				env,
				attachPm: "success",
			});

		testClockId = testClockId1!;
		_customer = customer_!;
	});

	it("should attach pro quarterly product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: proQuarter,
			stripeCli,
			db,
			org,
			env,
		});
	});

	it("should downgrade to premium", async () => {
		await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: proQuarter,
			newProduct: premium,
			stripeCli,
			db,
			org,
			env,
		});
	});

	let preview = null;

	it("should downgrade to pro", async () => {
		const { preview: preview_ } = await expectDowngradeCorrect({
			autumn,
			customerId,
			curProduct: proQuarter,
			newProduct: pro,
			stripeCli,
			db,
			org,
			env,
		});

		preview = preview_;
	});

	it("should have correct invoice after cycle", async () => {
		await advanceMonths({ stripeCli, testClockId, numberOfMonths: 3 });

		await timeout(10000);

		await expectNextCycleCorrect({
			preview: preview!,
			autumn,
			stripeCli,
			customerId,
			testClockId,
			product: pro,
			db,
			org,
			env,
		});
	});

	return;
});
