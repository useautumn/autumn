import chalk from "chalk";
import { expect } from "chai";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { features } from "tests/global.js";
import { setupBefore } from "tests/before.js";

import {
  AppEnv,
  BillingInterval,
  EntInterval,
  ProductItemFeatureType,
  UsageModel,
} from "@autumn/shared";
import { createProducts } from "tests/utils/productUtils.js";
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
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { addMonths } from "date-fns";
import { DrizzleCli } from "@/db/initDrizzle.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
let pro = {
  id: "multiFeature3Pro",
  name: "Multi Feature 3 Pro",
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
    customerId,
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

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "multi-feature/multi_feature3: Testing lifetime + pay per use, advance test clock",
)}`, () => {
  let autumn: AutumnInt = new AutumnInt();
  let customerId = "multiFeature3Customer";

  let totalUsage = 0;

  let testClockId: string;
  before(async function () {
    await setupBefore(this);

    let { customer, testClockId: _testClockId } =
      await initCustomerWithTestClock({
        customerId,
        db: this.db,
        org: this.org,
        env: this.env,
      });

    testClockId = _testClockId;

    autumn = this.autumn;

    await createProducts({
      autumn,
      products: [pro],
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

  let overageValue = 30;
  it("should use lifetime allowance + overage", async function () {
    let value = pro.items.lifetime.included_usage as number;
    value += overageValue;

    await autumn.track({
      customer_id: customerId,
      value,
      feature_id: features.metered1.id,
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

    expect(lifetimeCusEnt?.balance).to.equal(0);
    expect(usageCusEnt?.balance).to.equal(-overageValue);
  });

  it("cycle 1:should have correct usage after first cycle", async function () {
    let advanceTo = addMonths(new Date(), 1).getTime();
    await advanceTestClock({
      stripeCli: this.stripeCli,
      testClockId,
      advanceTo,
    });

    let { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
      customerId,
      db: this.db,
      orgId: this.org.id,
      env: this.env,
      featureId: features.metered1.id,
    });

    expect(lifetimeCusEnt?.balance).to.equal(0);
    expect(usageCusEnt?.balance).to.equal(0);
  });
});
