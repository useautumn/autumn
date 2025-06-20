import chalk from "chalk";
import Stripe from "stripe";

import {
  APIVersion,
  AppEnv,
  CreateEntity,
  LimitedItem,
  Organization,
} from "@autumn/shared";

import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../../attach/utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { addHours, addMonths } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";

let user = TestFeature.Users;
let admin = TestFeature.Admin;

let userMessages = constructArrearItem({
  featureId: TestFeature.Messages,
  price: 0.5,
  entityFeatureId: user,
}) as LimitedItem;

export let pro = constructProduct({
  items: [userMessages],
  type: "pro",
});

const testCase = "role2";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing overages for per entity`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;
  let testClockId: string;

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
  });

  let user1 = "user1";
  let user2 = "user2";

  let firstEntities: CreateEntity[] = [
    {
      id: user1,
      name: "test",
      feature_id: user,
    },
    {
      id: user2,
      name: "test",
      feature_id: user,
    },
  ];

  it("should create initial entities, then attach pro", async function () {
    await autumn.entities.create(customerId, firstEntities);

    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      skipSubCheck: true,
      entities: firstEntities,
    });

    let customer = await autumn.customers.get(customerId);
    expect(customer.features[TestFeature.Messages].included_usage).to.equal(
      userMessages.included_usage * firstEntities.length,
    );
  });

  let user1Usage = 125000;
  let user2Usage = 150000;
  it("should track correct usage for seat messages", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: user1Usage,
      entity_id: user1,
    });

    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: user2Usage,
      entity_id: user2,
    });

    await timeout(4000);

    let includedUsage = userMessages.included_usage;

    let { balance: userBalance } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      entity_id: user1,
    });

    expect(userBalance).to.equal(includedUsage - user1Usage);

    let { balance: user2Balance } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      entity_id: user2,
    });

    expect(user2Balance).to.equal(includedUsage - user2Usage);
  });

  it("should have correct invoice next cycle", async function () {
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addHours(
        addMonths(new Date(), 1),
        hoursToFinalizeInvoice,
      ).getTime(),
      waitForSeconds: 30,
    });

    let includedUsage = userMessages.included_usage;
    let user1Overage = user1Usage - includedUsage;
    let user2Overage = user2Usage - includedUsage;

    let totalUsage = user1Overage + user2Overage + includedUsage;

    let expectedInvoiceTotal = await getExpectedInvoiceTotal({
      customerId,
      productId: pro.id,
      usage: [{ featureId: TestFeature.Messages, value: totalUsage }],
      stripeCli,
      db,
      org,
      env,
      expectExpired: true,
    });

    let customer = await autumn.customers.get(customerId);
    expect(customer.invoices[0].total).to.equal(expectedInvoiceTotal);
  });
});
