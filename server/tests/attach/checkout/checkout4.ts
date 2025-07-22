import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts, createReward } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import {
  constructCoupon,
  constructProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { expect } from "chai";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";

export let pro = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 100,
    }),
  ],
  type: "pro",
});

const reward = constructCoupon({
  id: "checkout4",
  promoCode: "checkout4_code",
});

const testCase = "checkout4";
describe(`${chalk.yellowBright(`${testCase}: Testing attach coupon`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt();
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
      // attachPm: "success",
    });

    await createReward({
      orgId: org.id,
      env,
      db,
      autumn,
      reward,
      productId: pro.id,
    });

    testClockId = testClockId1!;
  });

  it("should attach pro and one off product", async function () {
    const res = await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      reward: reward.id,
    });

    await completeCheckoutForm(res.checkout_url);
    await timeout(10000);

    const customer = await autumn.customers.get(customerId);

    expectProductAttached({
      customer,
      product: pro,
    });

    expect(customer.invoices.length).to.equal(1);
    let totalPrice = getBasePrice({ product: pro });
    expect(customer.invoices[0].total).to.equal(
      totalPrice - reward.discount_config!.discount_value
    );
  });
});
