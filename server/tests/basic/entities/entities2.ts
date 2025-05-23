import { compareMainProduct } from "../../utils/compare.js";

import { entityProducts, features } from "../../global.js";

import { assert, expect } from "chai";
import chalk from "chalk";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";
import {
  BillingInterval,
  CusProductStatus,
  EntInterval,
  ErrCode,
  ProductItemFeatureType,
  UsageModel,
} from "@autumn/shared";
import { getFeaturePrice, getUsagePriceTiers } from "tests/utils/genUtils.js";

import { Stripe } from "stripe";
import { CusService } from "@/internal/customers/CusService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { checkBalance } from "tests/utils/autumnUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addHours, addMonths } from "date-fns";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { hashApiKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import {
  constructFeatureItem,
  constructFeaturePriceItem,
} from "@/internal/products/product-items/productItemUtils.js";
import { createProduct } from "tests/utils/productUtils.js";

// Check balance and stripe quantity
const checkEntAndStripeQuantity = async ({
  sb,
  autumn,
  stripeCli,
  featureId,
  customerId,
  expectedBalance,
  expectedUsage,
  expectedStripeQuantity,
}: {
  sb: SupabaseClient;
  autumn: Autumn;
  stripeCli: Stripe;
  featureId: string;
  customerId: string;
  expectedBalance: number;
  expectedUsage?: number;
  expectedStripeQuantity: number;
}) => {
  let { customer, entitlements, products } = await autumn.customers.get(
    customerId
  );

  let cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withPrices: true,
    withProduct: true,
    inStatuses: [CusProductStatus.Active],
  });

  let entitlement = entitlements.find((e: any) => e.feature_id == featureId);

  expect(entitlement.balance).to.equal(expectedBalance);
  if (expectedUsage) {
    expect(entitlement.used).to.equal(
      expectedUsage,
      `Get customer ${customerId} returned incorrect "used" for feature ${featureId}`
    );
  }

  if (products.length == 0) {
    assert.fail(`Get customer ${customerId} returned no products`);
  }

  // 2. Get stripe quantity
  let mainProduct = products[0];

  if (mainProduct.subscription_ids.length == 0) {
    assert.fail(`Get customer ${customerId} returned no subscriptions`);
  }

  let price = getFeaturePrice({
    product: mainProduct,
    featureId: featureId,
    cusProducts,
  });

  if (!price) {
    assert.fail(
      `Get customer ${customerId} returned no price for feature ${featureId}`
    );
  }

  let stripeSub = await stripeCli.subscriptions.retrieve(
    mainProduct.subscription_ids[0]
  );
  let subItem = stripeSub.items.data.find(
    (item: any) => item.price.id == price.config!.stripe_price_id
  );

  if (!subItem) {
    assert.fail(
      `Get customer ${customerId} returned no sub item for feature ${featureId}`
    );
  }

  expect(subItem.quantity).to.equal(
    expectedStripeQuantity,
    `Get customer ${customerId} returned incorrect stripe quantity for feature ${featureId}`
  );
};

// UNCOMMENT FROM HERE
let entity2Pro = {
  id: "entity2Pro",
  name: "Entity 2 Pro",
  items: {
    seats: constructFeaturePriceItem({
      feature_id: features.seats.id,
      included_usage: 0,
      price: 150,
      interval: BillingInterval.Month,
      usage_model: UsageModel.PayPerUse,
    }),
    metered1: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      included_usage: 50_000,
      billing_units: 50_000,
      price: 10,
      interval: BillingInterval.Month,
      entity_feature_id: features.seats.id,
    }),
    metered2: constructFeatureItem({
      feature_id: features.metered2.id,
      included_usage: 4000,
      interval: EntInterval.Month,
      entity_feature_id: features.seats.id,
    }),
  },
};

describe(`${chalk.yellowBright(
  "entities2: Testing entities with prorate_unused: true"
)}`, () => {
  let customerId = "entity2";
  let autumn: Autumn;
  let stripeCli: Stripe;
  let testClockId: string;

  before(async function () {
    await setupBefore(this);
    autumn = this.autumn;
    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomerWithTestClock({
      customerId,
      sb: this.sb,
      org: this.org,
      env: this.env,
    });

    await createProduct({
      autumn: this.autumn,
      product: entity2Pro,
    });

    testClockId = testClockId1;

    // await this.sb
    //   .from("organizations")
    //   .update({
    //     config: {
    //       ...this.org.config,
    //       prorate_unused: true,
    //     },
    //   })
    //   .eq("id", this.org.id);

    // await CacheManager.invalidate({
    //   action: CacheType.SecretKey,
    //   value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
    // });
    // await CacheManager.disconnect();
  });

  it("should create entity, then attach pro product", async function () {
    await autumn.entities.create(customerId, {
      id: "1",
      name: "seat_1",
      featureId: features.seats.id,
    });

    await autumn.attach({
      customerId,
      productId: entity2Pro.id,
    });

    let { customer, invoices } = await autumn.customers.get(customerId);

    expect(invoices.length).to.equal(1);
    expect(invoices[0].total).to.equal(entity2Pro.items.seats.price);
  });

  after(async function () {
    // await this.sb
    //   .from("organizations")
    //   .update({
    //     config: {
    //       ...this.org.config,
    //       prorate_unused: true,
    //     },
    //   })
    //   .eq("id", this.org.id);
    // void CacheManager.invalidate({
    //   action: CacheType.SecretKey,
    //   value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
    // });
  });
});
