import { AutumnInt } from "@/external/autumn/autumnCli.js";
// Manual customer creation - not using initCustomer to control test clock properly
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";

import {
  defaultTrialPro,
  setupDefaultTrialBefore,
} from "./defaultTrialBefore.test.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";
import { addDays, addHours } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";

// 2.2:
// -> Creating a new customer with a payment method should attach the pro product with default trial
// --> Advancing the test clock should cancel the trial and attach the pro product

const testCase = "defaultTrial2";

describe(`${chalk.yellowBright(`advanced/${testCase}: ensure trial transitions into full product if payment method is valid`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockID: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

  let curUnix = Math.floor(new Date().getTime() / 1000);

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
      attachPm: "success",
    });

    testClockID = res.testClockId;
  });

  it("should create a customer with the paid default trial", async function () {
    let customer = await autumn.customers.get(customerId);

    expectProductAttached({
      customer,
      product: defaultTrialPro,
    });
  });

  it("should be active after 7 days", async function () {
    await advanceTestClock({
      stripeCli,
      testClockId: testClockID,
      advanceTo: addHours(
        addDays(new Date(), 7),
        hoursToFinalizeInvoice
      ).getTime(),
      waitForSeconds: 10,
    });

    let customer = await autumn.customers.get(customerId);

    expectProductAttached({
      customer,
      product: defaultTrialPro,
      status: CusProductStatus.Active,
    });
  });
});
