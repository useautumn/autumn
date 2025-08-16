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
  constructArrearProratedItem,
  constructFeatureItem,
  constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

const messageItem = constructArrearProratedItem({
  featureId: TestFeature.Users,
  includedUsage: 1,
  pricePerUnit: 10,
  usageLimit: 3,
}) as LimitedItem;

export let pro = constructProduct({
  items: [messageItem],
  type: "pro",
});

const testCase = "usageLimit4";

describe(`${chalk.yellowBright(`${testCase}: Testing usage limits for cont use item`)}`, () => {
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
  it("should attach pro product and update quantity with quantity exceeding usage limit and get an error", async function () {
    await expectAutumnError({
      errCode: ErrCode.InvalidInputs,
      func: async () => {
        await autumn.track({
          customer_id: customerId,
          feature_id: TestFeature.Users,
          value: messageItem.usage_limit! + 1,
        });
      },
    });

    const check = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Users,
    });

    expect(check.balance).to.equal(0);
    expect(check.allowed).to.equal(true);
  });
});
