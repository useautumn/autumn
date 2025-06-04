import chalk from "chalk";
import Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";

import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  FullCusProduct,
  Organization,
} from "@autumn/shared";
import { addPrefixToProducts, runAttachTest } from "./utils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks, getDate } from "date-fns";
import { CusService } from "@/internal/customers/CusService.js";
import { expect } from "chai";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { expectSubAnchorsSame } from "tests/utils/expectUtils/expectSubUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

// Shared products for attach tests
const testCase = "upgrade2";
export let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

export let proAnnual = constructProduct({
  id: "pro_annual",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
  isAnnual: true,
});

export let premiumAnnual = constructProduct({
  id: "premium_annual",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
  isAnnual: true,
});

describe(`${chalk.yellowBright("attach/upgrade2: Testing usage upgrades with monthly -> annual")}`, () => {
  let customerId = "upgrade2";
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let stripeCli: Stripe;
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;

  const curUnix = new Date().getTime();

  before(async function () {
    await setupBefore(this);
    const { autumnJs } = this;

    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    addPrefixToProducts({
      products: [pro, proAnnual, premiumAnnual],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, proAnnual, premiumAnnual],
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
    await runAttachTest({
      autumn,
      customerId,
      product: pro,
    });
  });

  it("should attach pro annual product", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: 100000,
    });

    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 2).getTime(),
    });

    await runAttachTest({
      autumn,
      customerId,
      product: proAnnual,
    });

    // Check that subs have same anchor day
    await expectSubAnchorsSame({
      stripeCli,
      customerId,
      productId: proAnnual.id,
      db,
      org,
      env,
    });

    // Check that sub items are correct
  });
});
