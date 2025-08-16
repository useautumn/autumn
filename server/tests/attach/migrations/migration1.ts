import { expect } from "chai";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AppEnv, LimitedItem, Organization, ProductV2 } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { replaceItems } from "../utils.js";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";
import { defaultApiVersion } from "tests/constants.js";
import { runMigrationTest } from "./runMigrationTest.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

let messagesItem = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 500,
}) as LimitedItem;

let wordsItem = constructFeatureItem({
  featureId: TestFeature.Words,
  includedUsage: 100,
}) as LimitedItem;

export let free = constructProduct({
  items: [messagesItem, wordsItem],
  type: "free",
  isDefault: false,
});

const testCase = "migrations1";

describe(`${chalk.yellowBright(`${testCase}: Testing migration for free product`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
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
      products: [free],
      prefix: testCase,
    });

    await createProducts({
      db,
      orgId: org.id,
      env,
      autumn,
      products: [free],
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

  it("should attach free product", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: free,
      stripeCli,
      db,
      org,
      env,
    });
  });

  let newFree: ProductV2;
  let increaseMessagesBy = 100;
  let reduceWordsBy = 50;
  it("should update product to new version", async function () {
    newFree = structuredClone(free);

    let newItems = replaceItems({
      items: free.items,
      featureId: TestFeature.Messages,
      newItem: constructFeatureItem({
        featureId: TestFeature.Messages,
        includedUsage:
          (messagesItem.included_usage as number) + increaseMessagesBy,
      }),
    });

    newItems = replaceItems({
      items: newItems,
      featureId: TestFeature.Words,
      newItem: constructFeatureItem({
        featureId: TestFeature.Words,
        includedUsage: (wordsItem.included_usage as number) - reduceWordsBy,
      }),
    });

    newFree.items = newItems;

    await autumn.products.update(free.id, {
      items: newItems,
    });
  });

  it("should attach track usage and get correct balance", async function () {
    let wordsUsage = 25;
    let messagesUsage = 20;
    await autumn.track({
      customer_id: customerId,
      value: wordsUsage,
      feature_id: TestFeature.Words,
    });

    await autumn.track({
      customer_id: customerId,
      value: messagesUsage,
      feature_id: TestFeature.Messages,
    });

    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(Date.now(), 1).getTime(),
      waitForSeconds: 30,
    });

    let customer = await autumn.customers.get(customerId);

    await autumn.migrate({
      from_product_id: free.id,
      to_product_id: newFree.id,
      from_version: 1,
      to_version: 2,
    });

    await timeout(4000);

    // 1. Get features
    customer = await autumn.customers.get(customerId);

    await runMigrationTest({
      autumn,
      stripeCli,
      customerId,
      fromProduct: free,
      toProduct: newFree,
      db,
      org,
      env,
      usage: [
        {
          featureId: TestFeature.Words,
          value: wordsUsage,
        },
        {
          featureId: TestFeature.Messages,
          value: messagesUsage,
        },
      ],
    });
  });
});
