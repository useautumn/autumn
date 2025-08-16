import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import {
  expectDowngradeCorrect,
  expectNextCycleCorrect,
} from "tests/utils/expectUtils/expectScheduleUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

const testCase = "others1";

export let free = constructProduct({
  items: [],
  type: "free",
  isDefault: false,
});

export let pro = constructProduct({
  items: [],
  type: "pro",
  trial: true,
});

export let premium = constructProduct({
  items: [],
  type: "premium",
  trial: true,
});

describe(`${chalk.yellowBright(`${testCase}: Testing trials: pro with trial -> premium with trial -> free`)}`, () => {
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
      products: [free, pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [free, pro, premium],
      db,
      orgId: org.id,
      env,
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

  it("should attach pro product (with trial)", async function () {
    await attachAndExpectCorrect({
      autumn,
      stripeCli,
      customerId,
      product: pro,
      db,
      org,
      env,
    });
  });

  it("should attach premium product (with trial)", async function () {
    await attachAndExpectCorrect({
      autumn,
      stripeCli,
      customerId,
      product: premium,
      db,
      org,
      env,
    });
  });

  it("should attach free product at the end of the trial", async function () {
    const { preview } = await expectDowngradeCorrect({
      autumn,
      stripeCli,
      customerId,
      curProduct: premium,
      newProduct: free,
      db,
      org,
      env,
    });
    expectNextCycleCorrect({
      autumn,
      preview,
      stripeCli,
      customerId,
      testClockId,
      product: free,
      db,
      org,
      env,
    });
  });
});
