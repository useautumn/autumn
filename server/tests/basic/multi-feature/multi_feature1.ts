import { expect } from "chai";
import chalk from "chalk";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { features } from "tests/global.js";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "tests/utils/init.js";
import {
  AppEnv,
  BillingInterval,
  ProductItemFeatureType,
  UsageModel,
} from "@autumn/shared";
import { createProduct } from "tests/utils/productUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import { getUsageCusEnt } from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getPrepaidCusEnt } from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { constructFeaturePriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { timeout } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
let pro = {
  id: "multiFeature1Pro",
  name: "Multi Feature 1 Pro",
  items: {
    prepaid: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      feature_type: ProductItemFeatureType.SingleUse,
      included_usage: 50,
      price: 10,
      interval: BillingInterval.Month,
      usage_model: UsageModel.Prepaid,
    }),
    payPerUse: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      feature_type: ProductItemFeatureType.SingleUse,
      included_usage: 0,
      price: 0.5,
      interval: BillingInterval.Month,
      usage_model: UsageModel.PayPerUse,
    }),
  },
};

let premium = {
  id: "multiFeature1Premium",
  name: "Multi Feature 1 Premium",
  items: {
    // Prepaid
    prepaid: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      feature_type: ProductItemFeatureType.SingleUse,
      included_usage: 100,
      price: 15,
      interval: BillingInterval.Month,
      usage_model: UsageModel.Prepaid,
    }),

    // Pay per use
    payPerUse: constructFeaturePriceItem({
      feature_id: features.metered1.id,
      feature_type: ProductItemFeatureType.SingleUse,
      included_usage: 0,
      price: 1,
      interval: BillingInterval.Month,
      usage_model: UsageModel.PayPerUse,
    }),
  },
};

export const getPrepaidAndUsageCusEnts = async ({
  customerId,
  db,
  orgId,
  env,
  featureId,
}: {
  customerId: string;
  db: DrizzleCli;
  orgId: string;
  env: AppEnv;
  featureId: string;
}) => {
  let mainCusProduct = await getMainCusProduct({
    customerId,
    db,
    orgId,
    env,
  });

  let prepaidCusEnt = getPrepaidCusEnt({
    cusProduct: mainCusProduct!,
    featureId,
  });

  let usageCusEnt = getUsageCusEnt({
    cusProduct: mainCusProduct!,
    featureId,
  });

  return { prepaidCusEnt, usageCusEnt };
};

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "multi-feature/multi_feature1: Testing prepaid + pay per use -> prepaid + pay per use",
)}`, () => {
  let autumn: Autumn;
  let customerId = "multiFeature1Customer";
  let prepaidQuantity = 10;
  let prepaidAllowance = pro.items.prepaid.included_usage + prepaidQuantity;

  let totalUsage = 0;

  let premiumPrepaidAllowance =
    premium.items.prepaid.included_usage + prepaidQuantity;

  let optionsList = [
    {
      feature_id: features.metered1.id,
      quantity: prepaidQuantity,
    },
  ];

  before(async function () {
    await setupBefore(this);

    await initCustomer({
      customerId,
      db: this.db,
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
      options: optionsList,
    });

    let { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
      customerId,
      db: this.db,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    expect(prepaidCusEnt?.balance).to.equal(
      prepaidQuantity + pro.items.prepaid.included_usage,
    );

    expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
  });

  it("should use prepaid allowance first", async function () {
    let value = 60;

    await autumn.events.send({
      customerId,
      value,
      featureId: features.metered1.id,
    });

    totalUsage += value;

    await timeout(3000);

    let { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
      customerId,
      db: this.db,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    expect(prepaidCusEnt?.balance).to.equal(prepaidAllowance - value);
    expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
  });

  it("should have correct usage / invoice after upgrade", async function () {
    let value = 60;
    await autumn.events.send({
      customerId,
      value,
      featureId: features.metered1.id,
    });

    totalUsage += value;

    await timeout(3000);

    let { usageCusEnt } = await getPrepaidAndUsageCusEnts({
      customerId,
      db: this.db,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    // totalUsage = totalUsage + value - (usageCusEnt?.balance ?? 0);

    await autumn.attach({
      customerId,
      productId: premium.id,
      options: optionsList,
    });

    let { prepaidCusEnt, usageCusEnt: newUsageCusEnt } =
      await getPrepaidAndUsageCusEnts({
        customerId,
        db: this.db,
        orgId: this.org.id,
        env: this.env,
        featureId: features.metered1.id,
      });

    // Check invoice too
    let { invoices } = await autumn.customers.get(customerId);
    // 1. Let invoices[1] be 10 * premium prepaid price - pro prepaid price
    // 2. Let invoices[0] be  value * pro pay per use price

    let invoice1Amount =
      (premium.items.prepaid.price ?? 0) * prepaidQuantity -
      (pro.items.prepaid.price ?? 0) * prepaidQuantity;

    let invoice0Amount = value * (pro.items.payPerUse.price ?? 0);

    expect(invoices[1].total).to.equal(invoice1Amount);
    expect(invoices[0].total).to.equal(invoice0Amount);

    // console.log("Total usage", totalUsage);
    // console.log("Premium prepaid allowance", premiumPrepaidAllowance);
    // console.log("Value", value);

    let leftover = premiumPrepaidAllowance - totalUsage + value;
    expect(prepaidCusEnt?.balance).to.equal(Math.max(0, leftover));

    expect(newUsageCusEnt?.balance).to.equal(0);
  });
});
