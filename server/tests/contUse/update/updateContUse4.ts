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
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { attachNewContUseAndExpectCorrect } from "tests/utils/expectUtils/expectContUse/expectUpdateContUse.js";
import { expect } from "chai";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";

let userItem = constructArrearProratedItem({
  featureId: TestFeature.Users,
  pricePerUnit: 50,
  includedUsage: 1,
  config: {
    on_increase: OnIncrease.ProrateImmediately,
    on_decrease: OnDecrease.ProrateImmediately,
  },
});

export let pro = constructProduct({
  items: [userItem],
  type: "pro",
});

const testCase = "updateContUse4";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing update contUse included usage, prorate now`)}`, () => {
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

  const firstEntities = [
    {
      id: "1",
      name: "entity1",
      feature_id: TestFeature.Users,
    },
    {
      id: "2",
      name: "entity2",
      feature_id: TestFeature.Users,
    },
  ];

  let usage = 0;
  it("should attach pro", async function () {
    await autumn.entities.create(customerId, firstEntities);
    usage += firstEntities.length;

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
      on_increase: OnIncrease.ProrateImmediately,
      on_decrease: OnDecrease.ProrateImmediately,
    },
  });

  it("should update product with extra included usage", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 2).getTime(),
      waitForSeconds: 5,
    });

    let customItems = replaceItems({
      featureId: TestFeature.Users,
      items: pro.items,
      newItem,
    });

    const { invoices } = await attachNewContUseAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      customItems,
      numInvoices: 2,
    });

    const { stripeSubs } = await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: 0,
    });

    // Do own calculation too..
    let sub = stripeSubs[0];
    let amount = -userItem.price!;
    let proratedAmount = calculateProrationAmount({
      amount,
      periodStart: sub.current_period_start * 1000,
      periodEnd: sub.current_period_end * 1000,
      now: curUnix,
      allowNegative: true,
    });
    proratedAmount = Number(proratedAmount.toFixed(2));

    expect(invoices[0].total).to.equal(
      proratedAmount,
      "invoice is equal to calculated prorated amount",
    );
  });

  const reducedUsage = 3;
  const newItem2 = constructArrearProratedItem({
    featureId: TestFeature.Users,
    pricePerUnit: 50,
    includedUsage: (newItem.included_usage as number) - reducedUsage,
    config: {
      on_increase: OnIncrease.ProrateImmediately,
      on_decrease: OnDecrease.ProrateImmediately,
    },
  });

  it("should update product with reduced included usage", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 1).getTime(),
      waitForSeconds: 5,
    });

    let customItems = replaceItems({
      featureId: TestFeature.Users,
      items: pro.items,
      newItem: newItem2,
    });

    const { invoices } = await attachNewContUseAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      customItems,
      numInvoices: 3,
    });

    const { stripeSubs } = await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: 0,
    });

    // Do own calculation too..
    let sub = stripeSubs[0];
    let amount = Math.min(reducedUsage, usage) * userItem.price!;

    let proratedAmount = calculateProrationAmount({
      amount,
      periodStart: sub.current_period_start * 1000,
      periodEnd: sub.current_period_end * 1000,
      now: curUnix,
      allowNegative: true,
    });
    proratedAmount = Number(proratedAmount.toFixed(2));

    expect(invoices[0].total).to.equal(
      proratedAmount,
      "invoice is equal to calculated prorated amount",
    );
  });
});
