import { features, products, referralPrograms } from "../../global.js";
import { assert } from "chai";
import chalk from "chalk";
import AutumnError, { Autumn } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";
import {
  BillingInterval,
  Customer,
  EntInterval,
  ErrCode,
  ProductItemInterval,
  ReferralCode,
  RewardRedemption,
  UsageUnlimited,
} from "@autumn/shared";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays, addHours, addMonths } from "date-fns";
import { Stripe } from "stripe";
import { initCustomer } from "tests/utils/init.js";
import {
  constructFeatureItem,
  constructPriceItem,
} from "@/internal/products/product-items/productItemUtils.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "product1: Testing create and update product"
)}`, () => {
  let autumn: Autumn;

  before(async function () {
    await setupBefore(this);
    autumn = this.autumn;
  });

  it("should create product", async function () {
    try {
      await autumn.products.delete("product-1");
    } catch (error) {}

    await autumn.products.create({
      id: "product-1",
      name: "Product 1",
    });

    let product = await autumn.products.get("product-1");

    assert.equal(product.name, "Product 1");
    assert.equal(product.id, "product-1");
    assert.equal(product.is_add_on, false);
    assert.equal(product.is_default, false);
    assert.equal(product.version, 1);
    assert.equal(product.group, "");
  });

  let items = [
    // 1. Boolean feature
    constructFeatureItem({
      feature_id: features.boolean1.id,
    }),

    // 2. Limited feature
    constructFeatureItem({
      feature_id: features.metered1.id,
      included_usage: 100,
      interval: EntInterval.Month,
    }),

    // 3. Unlimited feature
    constructFeatureItem({
      feature_id: features.infinite1.id,
      included_usage: UsageUnlimited,
    }),

    // 4. Fixed Price
    constructPriceItem({
      amount: 10,
      interval: BillingInterval.Month,
    }),

    // 5. Fixed one off price
    constructPriceItem({
      amount: 50,
      interval: BillingInterval.OneOff,
    }),
  ];

  it("should create free price and free feature", async function () {
    await autumn.products.update("product-1", {
      items: items,
    });

    let product = await autumn.products.get("product-1", {
      v1Schema: false,
    });

    items = product.items;

    assert.equal(items.length, 5);
  });

  // 1. Update metered feature and price
  it("should update metered feature and fixed price correctly", async function () {
    items[1].included_usage = 200;

    items[3].amount = 20;
    items[3].interval = BillingInterval.OneOff as any;

    await autumn.products.update("product-1", {
      items: items,
    });

    let product = await autumn.products.get("product-1", {
      v1Schema: true,
    });

    let metered1Ent = product.entitlements.find(
      (ent: any) => ent.id === items[1].entitlement_id
    );

    assert.equal(metered1Ent.allowance, 200);

    let price = product.prices.find(
      (price: any) => price.id === items[3].price_id
    );

    assert.equal(price.config.amount, 20);
    assert.equal(price.config.interval, BillingInterval.OneOff);
  });
});

describe(`${chalk.yellowBright(
  "product1: Testing attach and update product"
)}`, () => {
  let autumn: Autumn;
  let customerId = "product-1-customer";
  before(async function () {
    await setupBefore(this);
    autumn = this.autumn;

    await initCustomer({
      customerId,
      sb: this.sb,
      org: this.org,
      env: this.env,
      attachPm: true,
    });

    await autumn.attach({
      customerId,
      productId: "product-1",
    });
  });
});
