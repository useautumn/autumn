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
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { addWeeks } from "date-fns";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/attach/entities/expectEntity.js";

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

const testCase = "updateContUse1";

describe(`${chalk.yellowBright(`attach/entities/${testCase}: Testing update contUse, add included usage`)}`, () => {
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

  let usage = 0;
  let firstEntities = [
    {
      id: "1",
      name: "test",
      featureId: TestFeature.Users,
    },
    {
      id: "2",
      name: "test2",
      featureId: TestFeature.Users,
    },
    {
      id: "3",
      name: "test3",
      featureId: TestFeature.Users,
    },
  ];

  it("should create entity, then attach pro", async function () {
    await autumn.entities.create(customerId, firstEntities);
    usage += 3;

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      usage: [
        {
          featureId: TestFeature.Users,
          value: usage,
        },
      ],
    });
  });

  let extraUsage = 2;
  let newItem = constructArrearProratedItem({
    featureId: TestFeature.Users,
    pricePerUnit: 50,
    includedUsage: (userItem.included_usage as number) + extraUsage,
    config: {
      on_increase: OnIncrease.BillImmediately,
      on_decrease: OnDecrease.None,
    },
  });

  it("should update product with extra included usage", async function () {
    let customItems = replaceItems({
      featureId: TestFeature.Users,
      items: pro.items,
      newItem,
    });

    usage += extraUsage;

    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      is_custom: true,
      items: customItems,
    });

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: extraUsage,
    });

    // Will have 1 invoice because price is replaced...
  });

  const entities = [
    {
      id: "4",
      name: "test4",
      featureId: TestFeature.Users,
    },
    {
      id: "5",
      name: "test5",
      featureId: TestFeature.Users,
    },
  ];

  it("should create 2 entities and have no invoice", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(new Date(), 2).getTime(),
      waitForSeconds: 10,
    });

    await autumn.entities.create(customerId, entities);

    // Usage won't change since using replaceables...
    // usage += entities.length;

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: 0,
    });

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices;
    expect(invoices.length).to.equal(2);
  });
});
