import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import {
  constructProduct,
  constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";

export let pro = constructProduct({
  type: "pro",
  items: [],
});

export const addOn = constructRawProduct({
  id: "addOn",
  isAddOn: true,
  items: [
    constructFeatureItem({
      featureId: TestFeature.Credits,
    }),
  ],
});

const testCase = "addOn2";

describe(`${chalk.yellowBright(`${testCase}: Testing attach free add on twice (should be treated as one off?)`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

  before(async function () {
    await setupBefore(this);
    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    await initCustomer({
      db,
      org,
      env,
      autumn: this.autumnJs,
      customerId,
      fingerprint: "test",
      attachPm: "success",
    });

    addPrefixToProducts({
      products: [pro, addOn],
      prefix: testCase,
    });

    await createProducts({
      db,
      orgId: org.id,
      env,
      autumn,
      products: [pro, addOn],
    });
  });

  it("should attach pro product and free add on", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      skipSubCheck: true,
    });

    await autumn.attach({
      customer_id: customerId,
      product_id: addOn.id,
    });

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      product: addOn,
    });

    expectFeaturesCorrect({
      customer,
      product: addOn,
    });
  });
});
