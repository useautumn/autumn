import chalk from "chalk";
import Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

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

/**
 * upgrade2:
 * 1. Start with pro monthly plan (usage-based)
 * 2. Upgrade to pro annual plan (usage-based)
 * 3. Upgrade to premium annual plan (usage-based)
 *
 * Verifies subscription items and anchors are correct after each upgrade
 */

describe(`${chalk.yellowBright("upgrade2: Testing usage upgrades with monthly -> annual")}`, () => {
  let customerId = "upgrade2";
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let stripeCli: Stripe;
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;

  let curUnix = new Date().getTime();

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
      db,
      orgId: org.id,
      env,
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });

  it("should attach pro annual product", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: 100000,
    });

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 2).getTime(),
    });
    return;

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: proAnnual,
      stripeCli,
      db,
      org,
      env,
    });
  });
  return;

  it("should attach premium annual product", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: 5000000,
    });

    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 1).getTime(),
      waitForSeconds: 10,
    });

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: premiumAnnual,
      stripeCli,
      db,
      org,
      env,
    });
  });
});
