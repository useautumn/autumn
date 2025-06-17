import chalk from "chalk";
import Stripe from "stripe";

import { expect } from "chai";

import {
  APIVersion,
  AppEnv,
  CouponDurationType,
  CreateReward,
  Organization,
  RewardType,
} from "@autumn/shared";

import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import {
  constructArrearItem,
  constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import {
  addPrefixToProducts,
  getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import { createProducts, createReward } from "tests/utils/productUtils.js";
import { expectAttachCorrect } from "tests/utils/expectUtils/expectAttach.js";

const pro = constructProduct({
  type: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
});

const oneOff = constructProduct({
  type: "one_off",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Words,
      includedUsage: 500,
    }),
  ],
});

// Create reward input
const rewardId = "attach_coupon";
const promoCode = "attach_coupon_code";
const reward: CreateReward = {
  id: rewardId,
  name: "attach_coupon",
  promo_codes: [{ code: promoCode }],
  type: RewardType.FixedDiscount,
  discount_config: {
    discount_value: 5,
    duration_type: CouponDurationType.Forever,
    duration_value: 1,
    should_rollover: true,
    apply_to_all: true,
    price_ids: [],
  },
};

const testCase = "coupon3";
describe(chalk.yellow(`${testCase} - Testing attach coupon`), () => {
  let customerId = testCase;
  let stripeCli: Stripe;
  let testClockId: string;

  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let org: Organization;
  let env: AppEnv;
  let db: DrizzleCli;

  let couponAmount = reward.discount_config!.discount_value;

  before(async function () {
    await setupBefore(this);

    org = this.org;
    env = this.env;
    db = this.db;
    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomer({
      customerId,
      org: this.org,
      env: this.env,
      db: this.db,
      autumn: this.autumnJs,
      attachPm: "success",
    });

    testClockId = testClockId1;

    addPrefixToProducts({
      products: [pro, oneOff],
      prefix: testCase,
    });

    await createProducts({
      orgId: this.org.id,
      env: this.env,
      db: this.db,
      autumn,
      products: [pro, oneOff],
    });

    await createReward({
      orgId: org.id,
      env,
      db,
      autumn,
      reward,
      productId: pro.id,
    });
  });

  // CYCLE 0
  it("should attach pro with reward ID", async () => {
    const res = await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      reward: rewardId,
    });

    const customer = await autumn.customers.get(customerId);
    expectAttachCorrect({
      customer,
      product: pro,
    });

    const invoice = customer.invoices![0];
    let basePrice = getBasePrice({ product: pro });
    expect(invoice.total).to.equal(basePrice - couponAmount);
  });

  it("should attach one off with reward ID", async () => {
    await autumn.attach({
      customer_id: customerId,
      product_id: oneOff.id,
      reward: rewardId,
    });

    const customer = await autumn.customers.get(customerId);
    expectAttachCorrect({
      customer,
      product: oneOff,
    });

    const invoice = customer.invoices![0];
    let basePrice = getBasePrice({ product: oneOff });
    expect(invoice.total).to.equal(basePrice - couponAmount);
    expect(invoice.product_ids).to.include(oneOff.id);
  });

  it("should attach one off with promo code", async () => {
    await autumn.attach({
      customer_id: customerId,
      product_id: oneOff.id,
      reward: promoCode,
    });

    const customer = await autumn.customers.get(customerId);
    expectAttachCorrect({
      customer,
      product: oneOff,
    });

    expect(customer.invoices!.length).to.equal(3);
    let basePrice = getBasePrice({ product: oneOff });
    for (let i = 0; i < 2; i++) {
      let invoice = customer.invoices![i];
      expect(invoice.total).to.equal(basePrice - couponAmount);
      expect(invoice.product_ids).to.include(oneOff.id);
    }
  });
});
