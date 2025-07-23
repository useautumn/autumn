import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  OnDecrease,
  OnIncrease,
  Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { expect } from "chai";
import { addHours, addMonths } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";

const testCase = "prepaid4";

export let pro = constructProduct({
  items: [
    constructPrepaidItem({
      featureId: TestFeature.Messages,
      billingUnits: 100,
      price: 12.5,
      config: {
        on_increase: OnIncrease.ProrateImmediately,
        on_decrease: OnDecrease.None,
      },
    }),
  ],
  excludeBase: true,
  type: "pro",
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing prepaid reset`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

  let curUnix = new Date().getTime();

  before(async function () {
    await setupBefore(this);
    const { autumnJs } = this;
    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    const res = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    addPrefixToProducts({
      products: [pro],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro],
      db,
      orgId: org.id,
      env,
    });

    testClockId = res.testClockId!;
  });

  const options = [
    {
      feature_id: TestFeature.Messages,
      quantity: 300,
    },
  ];

  it("should attach pro product to customer", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      options,
    });

    let customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      product: pro,
    });
  });
  // return;

  const usage = 100;
  it("should track usage for prepaid and have correct balance", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: usage,
    });

    await timeout(3000);

    const customer = await autumn.customers.get(customerId);
    const newBalance = options[0].quantity - usage;
    expect(customer.features[TestFeature.Messages].balance).to.equal(
      newBalance
    );
  });

  it("should advance clock to next cycle and have correct balance", async function () {
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addHours(
        addMonths(new Date(), 1),
        hoursToFinalizeInvoice
      ).getTime(),
      waitForSeconds: 30,
    });

    const customer = await autumn.customers.get(customerId);
    expect(customer.features[TestFeature.Messages].balance).to.equal(
      options[0].quantity
    );
  });
});
