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
  constructArrearProratedItem,
  constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";

export let pro = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 100,
    }),
  ],
  type: "pro",
});

export const oneOff = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Users,
      includedUsage: 5,
    }),
  ],
  type: "one_off",
  isAddOn: true,
});

const testCase = "checkout3";
describe(`${chalk.yellowBright(`${testCase}: Testing multi attach checkout, pro + one off`)}`, () => {
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
      products: [pro, oneOff],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, oneOff],
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
      // attachPm: "success",
    });

    testClockId = testClockId1!;
  });

  it("should attach pro and one off product", async function () {
    const res = await autumn.attach({
      customer_id: customerId,
      product_ids: [pro.id, oneOff.id],
    });

    await completeCheckoutForm(res.checkout_url);
    await timeout(10000);

    const customer = await autumn.customers.get(customerId);

    expectProductAttached({
      customer,
      product: pro,
    });
    expectProductAttached({
      customer,
      product: oneOff,
    });

    expectFeaturesCorrect({
      customer,
      product: pro,
    });

    expectFeaturesCorrect({
      customer,
      product: oneOff,
    });
  });
});
