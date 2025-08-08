import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "tests/attach/utils.js";
import {
  constructArrearItem,
  constructArrearProratedItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectSubItemsCorrect } from "tests/utils/expectUtils/expectSubUtils.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";

const testCase = "upgrade6";

export let pro = constructProduct({
  items: [
    constructArrearItem({ featureId: TestFeature.Words }),
    constructArrearProratedItem({
      featureId: TestFeature.Users,
      pricePerUnit: 20,
    }),
  ],
  type: "pro",
});

export let premium = constructProduct({
  items: [
    constructArrearItem({ featureId: TestFeature.Words }),
    constructArrearProratedItem({
      featureId: TestFeature.Users,
      pricePerUnit: 30,
    }),
  ],
  type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing failed upgrades`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

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
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, premium],
      db,
      orgId: org.id,
      env,
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
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

  let usage = 100012;
  it("should upgrade to premium product and fail", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: usage,
    });
    await timeout(4000);

    let cus = await CusService.get({
      db,
      orgId: org.id,
      idOrInternalId: customerId,
      env,
    });

    await attachFailedPaymentMethod({ stripeCli, customer: cus! });
    await timeout(2000);

    await expectAutumnError({
      func: async () => {
        await runAttachTest({
          autumn,
          customerId,
          product: premium,
          stripeCli,
          db,
          org,
          env,
        });
      },
      errMessage: "Failed to update subscription. Your card was declined.",
    });

    await timeout(4000);
    let customer = await autumn.customers.get(customerId);

    expectProductAttached({
      customer,
      product: pro,
    });

    expectFeaturesCorrect({
      customer,
      product: pro,
      usage: [
        {
          featureId: TestFeature.Words,
          value: usage,
        },
      ],
    });

    await expectSubItemsCorrect({
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });
});
