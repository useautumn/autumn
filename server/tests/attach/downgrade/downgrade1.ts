import chalk from "chalk";
import Stripe from "stripe";

import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../utils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/internal/products/product-items/productItemUtils.js";
import { expectDowngradeCorrect } from "tests/utils/expectUtils/expectScheduleUtils.js";
import { expectNextCycleCorrect } from "tests/utils/expectUtils/expectScheduleUtils.js";

const testCase = "downgrade1";

let pro = constructProduct({
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

let premium = constructProduct({
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrade from premium -> pro`)}`, () => {
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
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, premium],
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

  it("should attach premium product", async function () {
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

  // let nextCycle = Date.now();
  let preview = null;

  it("should downgrade to pro", async function () {
    const { preview: preview_ } = await expectDowngradeCorrect({
      autumn,
      customerId,
      curProduct: premium,
      newProduct: pro,
      stripeCli,
      db,
      org,
      env,
    });

    preview = preview_;
  });

  it("should have pro attached on next cycle", async function () {
    await expectNextCycleCorrect({
      preview: preview!,
      autumn,
      stripeCli,
      customerId,
      testClockId,
      product: pro,
      db,
      org,
      env,
    });
  });
});
