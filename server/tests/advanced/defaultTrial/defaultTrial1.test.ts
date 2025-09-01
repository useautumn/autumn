// Manual customer creation - not using initCustomer to control test clock properly
import {
	APIVersion,
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";
import {
	defaultTrialFree,
	defaultTrialPro,
	setupDefaultTrialBefore,
} from "./defaultTrialBefore.test.js";

// Case 1: ✅
// Pro product with default trial exists alongside a free default product
// Or a pro product with default trial exists alone
// -> Creating a new customer should attach the pro product with default trial

// Case 3:
// Pro product with default trial exists alone
// -> Creating a new customer should attach the pro product with default trial

const testCase = "defaultTrial1";

describe(`${chalk.yellowBright(`advanced/${testCase}: ensure default trials are attached when creating a customer`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
	let testClockID: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	const _curUnix = Math.floor(Date.now() / 1000);

	before(async function () {
		await setupBefore(this);
		await setupDefaultTrialBefore({});
		const { autumnJs } = this;
		stripeCli = this.stripeCli;
		db = this.db;
		org = this.org;
		env = this.env;

		const res = await initCustomerV2({
			autumn: autumnJs,
			customerId: testCase,
			db,
			org,
			env,
		});

		testClockID = res.testClockId;
	});

	it("should create a customer with the paid default trial", async () => {
		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: defaultTrialPro,
			status: CusProductStatus.Trialing,
		});
	});

	describe("ensure trials automatically cancel if no payment method is provided", () => {
		it("should expire after 7 days", async () => {
			await advanceTestClock({
				stripeCli,
				testClockId: testClockID,
				numberOfDays: 8,
				waitForSeconds: 10,
			});

			const customer = await autumn.customers.get(customerId);

			expectProductAttached({
				customer,
				product: defaultTrialFree,
				status: CusProductStatus.Active,
			});
		});
	});
});
