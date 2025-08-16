import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  ErrCode,
  LimitedItem,
  Organization,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import {
  constructFeatureItem,
  constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

const messageItem = constructPrepaidItem({
  featureId: TestFeature.Messages,
  includedUsage: 50,
  billingUnits: 100,
  price: 8,
  usageLimit: 500,
}) as LimitedItem;

export let pro = constructProduct({
  items: [messageItem],
  type: "pro",
});

// const addOnMessages = constructFeatureItem({
//   featureId: TestFeature.Messages,
//   interval: null,
//   includedUsage: 250,
// }) as LimitedItem;

// const messageAddOn = constructProduct({
//   type: "one_off",
//   items: [addOnMessages],
// });

const testCase = "usageLimit3";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for prepaid`)}`, () => {
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

  it("should attach pro product with quantity exceeding usage limit and get an error", async function () {
    expectAutumnError({
      errCode: ErrCode.InvalidOptions,
      func: async () => {
        return await attachAndExpectCorrect({
          autumn,
          customerId,
          product: pro,
          stripeCli,
          db,
          org,
          env,
          options: [
            {
              feature_id: TestFeature.Messages,
              quantity: 600,
            },
          ],
        });
      },
    });
  });
  it("should attach pro product and update quantity with quantity exceeding usage limit and get an error", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      options: [
        {
          feature_id: TestFeature.Messages,
          quantity: 100,
        },
      ],
    });

    expectAutumnError({
      errCode: ErrCode.InvalidOptions,
      func: async () => {
        return await attachAndExpectCorrect({
          autumn,
          customerId,
          product: pro,
          stripeCli,
          db,
          org,
          env,
          options: [
            {
              feature_id: TestFeature.Messages,
              quantity: 600,
            },
          ],
        });
      },
    });
  });
});
