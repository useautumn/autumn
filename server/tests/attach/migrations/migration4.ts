import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  AppEnv,
  BillingInterval,
  Organization,
  ProductItemInterval,
  ProductV2,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { replaceItems } from "../utils.js";

import { defaultApiVersion } from "tests/constants.js";
import { runMigrationTest } from "./runMigrationTest.js";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays } from "date-fns";

let wordsItem = constructArrearItem({
  featureId: TestFeature.Words,
});

export let pro = constructProduct({
  items: [wordsItem],
  type: "pro",
  isDefault: false,
});

let newWordsItem = constructArrearItem({
  featureId: TestFeature.Words,
  includedUsage: 120100,
});

let proWithTrial = constructProduct({
  items: [newWordsItem],
  type: "pro",
  isDefault: false,
  trial: true,
});

const testCase = "migrations4";

describe(`${chalk.yellowBright(`${testCase}: Testing migration for pro with trial`)}`, () => {
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
      products: [pro],
      prefix: testCase,
    });

    await createProducts({
      db,
      orgId: org.id,
      env,
      autumn,
      products: [pro],
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

  it("should update product to new version", async function () {
    await autumn.products.update(pro.id, {
      items: proWithTrial.items,
    });
  });

  it("should attach track usage and get correct balance", async function () {
    let wordsUsage = 120000;
    await autumn.track({
      customer_id: customerId,
      value: wordsUsage,
      feature_id: TestFeature.Words,
    });

    await timeout(4000);

    // await advanceTestClock({
    //   stripeCli,
    //   testClockId,
    //   advanceTo: addDays(Date.now(), 4).getTime(),
    // });

    await runMigrationTest({
      autumn,
      stripeCli,
      customerId,
      fromProduct: pro,
      toProduct: proWithTrial,
      db,
      org,
      env,
      usage: [
        {
          featureId: TestFeature.Words,
          value: wordsUsage,
        },
      ],
    });
  });
});
