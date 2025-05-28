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
import { OrgService } from "@/internal/orgs/OrgService.js";

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
  "entities2: Testing entities with prorate_unused: true",
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
      db: this.db,
      org: this.org,
      env: this.env,
    });

    await createProduct({
      autumn: this.autumn,
      product: entity2Pro,
    });

    testClockId = testClockId1;

    await OrgService.update({
      db: this.db,
      orgId: this.org.id,
      updates: {
        config: { ...this.org.config, prorate_unused: true },
      },
    });

    await CacheManager.invalidate({
      action: CacheType.SecretKey,
      value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
    });
    await CacheManager.disconnect();
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
    await OrgService.update({
      db: this.db,
      orgId: this.org.id,
      updates: {
        config: { ...this.org.config, prorate_unused: false },
      },
    });

    void CacheManager.invalidate({
      action: CacheType.SecretKey,
      value: hashApiKey(process.env.UNIT_TEST_AUTUMN_SECRET_KEY!),
    });
  });
});
