import { expect } from "chai";
import chalk from "chalk";
import { features } from "tests/global.js";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  BillingInterval,
  EntInterval,
  ProductItemFeatureType,
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

import { timeout } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

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
      feature_type: ProductItemFeatureType.SingleUse,
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

export const getLifetimeAndUsageCusEnts = async ({
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
    customerId: customerId,
    db,
    orgId,
    env,
  });

  let lifetimeCusEnt = getLifetimeFreeCusEnt({
    cusProduct: mainCusProduct!,
    featureId,
  });

  let usageCusEnt = getUsageCusEnt({
    cusProduct: mainCusProduct!,
    featureId,
  });

  return { lifetimeCusEnt, usageCusEnt };
};

const testCase = "multiFeature2";
describe(`${chalk.yellowBright(
  "multiFeature2: Testing lifetime + pay per use -> pay per use",
)}`, () => {
  let autumn: AutumnInt = new AutumnInt();
  let autumn2: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
  let customerId = testCase;

  let totalUsage = 0;

  before(async function () {
    await setupBefore(this);

    await initCustomer({
      autumn: this.autumnJs,
      customerId,
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: "success",
    });

    autumn = this.autumn;

    await createProduct({
      autumn,
      product: pro,
      db: this.db,
      orgId: this.org.id,
      env: this.env,
    });

    await createProduct({
      autumn,
      product: premium,
      db: this.db,
      orgId: this.org.id,
      env: this.env,
    });
  });

  it("should attach pro product to customer", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
    });

    let { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
      customerId,
      db: this.db,
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
      db: this.db,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    expect(lifetimeCusEnt?.balance).to.equal(
      (pro.items.lifetime.included_usage as number) - value,
    );
    expect(usageCusEnt?.balance).to.equal(pro.items.payPerUse.included_usage);
  });

  it("should have correct usage after upgrade", async function () {
    let value = 20;

    await autumn.track({
      customer_id: customerId,
      value,
      feature_id: features.metered1.id,
    });

    await timeout(4000);

    await autumn.attach({
      customer_id: customerId,
      product_id: premium.id,
    });

    let { lifetimeCusEnt, usageCusEnt: newUsageCusEnt } =
      await getLifetimeAndUsageCusEnts({
        customerId,
        db: this.db,
        orgId: this.org.id,
        env: this.env,
        featureId: features.metered1.id,
      });

    expect(lifetimeCusEnt).to.not.exist;
    expect(newUsageCusEnt?.balance).to.equal(
      premium.items.payPerUse.included_usage,
    );

    // Check invoice too
    let res = await autumn2.customers.get(customerId);
    let invoices = res.invoices;

    let invoice0Amount = value * (pro.items.payPerUse.price ?? 0);
    expect(invoices![0].total).to.equal(
      invoice0Amount,
      "Invoice 0 should be 0",
    );
  });
});
