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
import { addPrefixToProducts, runAttachTest } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { expectSubQuantityCorrect } from "./expectEntity.js";
import { addWeeks } from "date-fns";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";

let userItem = constructArrearProratedItem({
  featureId: TestFeature.Users,
  pricePerUnit: 50,
  includedUsage: 1,
  config: {
    on_increase: OnIncrease.BillImmediately,
    on_decrease: OnDecrease.None,
  },
});

export let pro = constructProduct({
  items: [userItem],
  type: "pro",
});

const testCase = "entity2";

// Pro is $20 / month, Seat is $50 / user

describe(`${chalk.yellowBright(`attach/entities/${testCase}: Testing track usage for cont use`)}`, () => {
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

  it("should attach pro", async function () {
    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });

  let usage = 0;
  it("should create track +3 usage and have correct invoice", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(new Date(), 2).getTime(),
      waitForSeconds: 10,
    });

    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Users,
      value: 3,
    });

    usage += 3;

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
    });

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices;
    expect(invoices.length).to.equal(2);
    expect(invoices[0].total).to.equal(userItem.price! * 3);
  });

  return;

  it("should delete 1 entity and have no new invoice", async function () {
    await autumn.entities.delete(customerId, entities[0].id);

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices;
    expect(invoices.length).to.equal(2);

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: 1,
    });
  });

  const newEntities = [
    {
      id: "4",
      name: "test3",
      featureId: TestFeature.Users,
    },
    {
      id: "5",
      name: "test4",
      featureId: TestFeature.Users,
    },
  ];

  it("should create 2 entities and have correct invoice (only pay for 1)", async function () {
    await autumn.entities.create(customerId, newEntities);
    await timeout(3000);
    usage += 1;

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices;

    expect(invoices.length).to.equal(3);
    expect(invoices[0].total).to.equal(userItem.price!);

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
    });
  });
});
