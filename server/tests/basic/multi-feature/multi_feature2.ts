import { expect } from "chai";
import chalk from "chalk";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { features } from "tests/global.js";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "tests/utils/init.js";
import {
  AppEnv,
  BillingInterval,
  EntInterval,
  UsageModel,
} from "@autumn/shared";
import { createProduct } from "tests/utils/productUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import {
  getLifetimeFreeCusEnt,
  getUsageCusEnt,
} from "tests/utils/cusProductUtils/cusEntSearchUtils.js";

import {
  constructFeatureItem,
  constructFeaturePriceItem,
} from "@/internal/products/product-items/productItemUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { timeout } from "@/utils/genUtils.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
let pro = {
  id: "multiFeature2Pro",
  name: "Multi Feature 2 Pro",
  items: {
    lifetime: constructFeatureItem({
      feature_id: features.metered1.id,
      included_usage: 50,
      interval: EntInterval.Lifetime,
    }),
    payPerUse: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      included_usage: 0,
      price: 0.5,
      interval: BillingInterval.Month,
      usage_model: UsageModel.PayPerUse,
    }),
  },
};

let premium = {
  id: "multiFeature2Premium",
  name: "Multi Feature 2 Premium",
  items: {
    // // Prepaid
    // prepaid: constructFeaturePriceItem({
    //   feature_id: features.metered1.id,
    //   included_usage: 100,
    //   amount: 15,
    //   interval: BillingInterval.Month,
    //   usage_model: UsageModel.Prepaid,
    // }),

    // Pay per use
    payPerUse: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      included_usage: 0,
      price: 1,
      interval: BillingInterval.Month,
      usage_model: UsageModel.PayPerUse,
    }),
  },
};

export const getLifetimeAndUsageCusEnts = async ({
  customerId,
  sb,
  orgId,
  env,
  featureId,
}: {
  customerId: string;
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  featureId: string;
}) => {
  let mainCusProduct = await getMainCusProduct({
    customerId,
    sb,
    orgId,
    env,
  });

  let lifetimeCusEnt = getLifetimeFreeCusEnt({
    cusProduct: mainCusProduct,
    featureId,
  });

  let usageCusEnt = getUsageCusEnt({
    cusProduct: mainCusProduct,
    featureId,
  });

  return { lifetimeCusEnt, usageCusEnt };
};

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "multi-feature/multi_feature2: Testing lifetime + pay per use -> pay per use"
)}`, () => {
  let autumn: Autumn;
  let customerId = "multiFeature2Customer";

  let totalUsage = 0;

  before(async function () {
    await setupBefore(this);

    await initCustomer({
      customerId,
      sb: this.sb,
      org: this.org,
      env: this.env,
      attachPm: true,
    });

    autumn = this.autumn;

    await createProduct({
      autumn,
      product: pro,
    });

    await createProduct({
      autumn,
      product: premium,
    });
  });

  it("should attach pro product to customer", async function () {
    await autumn.attach({
      customerId,
      productId: pro.id,
    });

    let { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
      customerId,
      sb: this.sb,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    expect(lifetimeCusEnt?.balance).to.equal(pro.items.lifetime.included_usage);

    expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
  });

  it("should use lifetime allowance first", async function () {
    let value = pro.items.lifetime.included_usage as number;

    await autumn.events.send({
      customerId,
      value,
      featureId: features.metered1.id,
    });

    totalUsage += value;

    await timeout(3000);

    let { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
      customerId,
      sb: this.sb,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    expect(lifetimeCusEnt?.balance).to.equal(
      (pro.items.lifetime.included_usage as number) - value
    );
    expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
  });

  it("should have correct usage after upgrade", async function () {
    let value = 20;

    await autumn.events.send({
      customerId,
      value,
      featureId: features.metered1.id,
    });
    await timeout(3000);

    await autumn.attach({
      customerId,
      productId: premium.id,
    });

    let { lifetimeCusEnt, usageCusEnt: newUsageCusEnt } =
      await getLifetimeAndUsageCusEnts({
        customerId,
        sb: this.sb,
        orgId: this.org.id,
        env: this.env,
        featureId: features.metered1.id,
      });

    // Check invoice too
    let { invoices } = await autumn.customers.get(customerId);
    // 1. Let invoices[1] be 10 * premium prepaid price - pro prepaid price
    // 2. Let invoices[0] be  value * pro pay per use price

    let invoice0Amount = value * (pro.items.payPerUse.price ?? 0);
    expect(invoices[0].total).to.equal(invoice0Amount);

    expect(lifetimeCusEnt).to.not.exist;

    expect(newUsageCusEnt?.balance).to.equal(
      premium.items.payPerUse.included_usage
    );
  });
});
