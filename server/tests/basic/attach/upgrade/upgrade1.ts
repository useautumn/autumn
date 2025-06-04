import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";
import { runAttachTest } from "../utils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

// UNCOMMENT FROM HERE
let pro = constructProduct({
  id: "attach1_pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});
let premium = constructProduct({
  id: "attach1_premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});
let growth = constructProduct({
  id: "attach1_growth",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "growth",
});

describe(`${chalk.yellowBright("attach/upgrade1: Testing usage upgrades")}`, () => {
  let customerId = "upgrade1";
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });

  let stripeCli: Stripe;
  let testClockId: string;
  let curUnix: number;
  let db: DrizzleCli;
  let org: Organization;
  let env: AppEnv;

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

    await createProducts({
      autumn,
      products: [pro, premium, growth],
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
    // 1. Run check
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

  it("should attach premium product", async function () {
    const wordsUsage = 100000;
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: wordsUsage,
    });

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(new Date(), 2).getTime(),
      waitForSeconds: 10,
    });

    await runAttachTest({
      autumn,
      customerId,
      product: premium,
      stripeCli,
      db,
      org,
      env,
    });
  });

  it("should attach growth product", async function () {
    const wordsUsage = 200000;
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: wordsUsage,
    });

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 1).getTime(),
      waitForSeconds: 10,
    });

    await runAttachTest({
      autumn,
      customerId,
      product: growth,
      stripeCli,
      db,
      org,
      env,
    });

    // const res = await autumn.attachPreview({
    //   customerId,
    //   productId: growth.id,
    // });

    // const total = getAttachTotal({
    //   preview: res,
    // });

    // await autumn.attach({
    //   customerId,
    //   productId: growth.id,
    // });

    // const customer = await autumn.customers.get(customerId);

    // expectProductAttached({
    //   customer,
    //   product: growth,
    // });

    // expectInvoicesCorrect({
    //   customer,
    //   first: { productId: growth.id, total },
    // });

    // expectFeaturesCorrect({
    //   customer,
    //   product: growth,
    // });
  });
});
