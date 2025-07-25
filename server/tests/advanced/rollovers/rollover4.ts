import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

import {
  APIVersion,
  AppEnv,
  Customer,
  LimitedItem,
  Organization,
  RolloverDuration,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addMonths } from "date-fns";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

let rolloverConfig = { max: 400, length: 1, duration: RolloverDuration.Month };
const messagesItem = constructPrepaidItem({
  featureId: TestFeature.Messages,
  includedUsage: 100,
  billingUnits: 300,
  price: 10,
  rolloverConfig,
}) as LimitedItem;

export let pro = constructProduct({
  items: [messagesItem],
  type: "pro",
  isDefault: false,
});

const testCase = "rollover4";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for usage price feature`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let customer: Customer;
  let stripeCli: Stripe;

  let curUnix = new Date().getTime();

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

    const res = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    testClockId = res.testClockId!;
    customer = res.customer;
  });

  let paidQuantity = 300;
  let balance = paidQuantity + messagesItem.included_usage;
  const options = [
    {
      feature_id: TestFeature.Messages,
      quantity: paidQuantity,
    },
  ];

  it("should attach pro product", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      options,
    });
  });

  let rollover = 50;
  it("should create track messages, reset, and have correct rollover", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: balance - rollover,
    });

    await timeout(3000);

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addMonths(new Date(), 1).getTime(),
      waitForSeconds: 20,
    });

    let cus = await autumn.customers.get(customerId);
    let msgesFeature = cus.features[TestFeature.Messages];

    // @ts-ignore
    let rollovers = msgesFeature?.rollovers;

    expect(msgesFeature).to.exist;
    expect(msgesFeature?.balance).to.equal(balance + rollover);
    expect(rollovers[0].balance).to.equal(rollover);
  });

  // let usage2 = 50;
  it("should  reset again and have correct rollover", async function () {
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addMonths(curUnix, 1).getTime(),
      waitForSeconds: 20,
    });

    let newRollover = Math.min(balance + rollover, rolloverConfig.max);
    let cus = await autumn.customers.get(customerId);
    let msgesFeature = cus.features[TestFeature.Messages];
    // @ts-ignore
    let rollovers = msgesFeature?.rollovers;

    expect(msgesFeature).to.exist;
    expect(msgesFeature?.balance).to.equal(balance + newRollover);
    expect(rollovers[0].balance).to.equal(0);
    expect(rollovers[1].balance).to.equal(400);
  });
});
