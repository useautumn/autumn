import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { getAttachTotal } from "tests/utils/testAttachUtils/testAttachUtils.js";

import { APIVersion, FeatureOptions, ProductV2 } from "@autumn/shared";
import {
  constructArrearItem,
  constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";
import {
  expectFeaturesCorrect,
  expectInvoicesCorrect,
  expectProductAttached,
} from "tests/utils/expectUtils/expectProductAttached.js";

// UNCOMMENT FROM HERE
let pro = constructProduct({
  id: "attach1_pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});
let premium = constructProduct({
  id: "attach1_premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});
let growth = constructProduct({
  id: "attach1_growth",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "growth",
});

const runAttachTest = async ({
  autumn,
  customerId,
  product,
  options,
}: {
  autumn: AutumnInt;
  customerId: string;
  product: ProductV2;
  options?: FeatureOptions[];
}) => {
  const res = await autumn.attachPreview({
    customerId,
    productId: product.id,
  });

  const total = getAttachTotal({
    preview: res,
    options,
  });

  const res2 = await autumn.attach({
    customerId,
    productId: product.id,
    options,
  });

  const customer = await autumn.customers.get(customerId);

  expectProductAttached({
    customer,
    product,
  });

  expectInvoicesCorrect({
    customer,
    first: { productId: product.id, total },
  });

  expectFeaturesCorrect({
    customer,
    product,
  });
};

describe(`${chalk.yellowBright("attach/upgrade1: Testing usage upgrades")}`, () => {
  let customerId = "upgrade1";
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

  let stripeCli: Stripe;
  let testClockId: string;
  let curUnix: number;

  before(async function () {
    await setupBefore(this);
    const { autumnJs, db, org, env } = this;

    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    await createProducts({
      autumn,
      products: [pro, premium, growth],
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
    // 1. Run check
    await runAttachTest({
      autumn,
      customerId,
      product: pro,
    });
  });

  it("should attach premium product", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: 100000,
    });

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(new Date(), 2).getTime(),
      waitForSeconds: 10,
    });

    await runAttachTest({
      autumn,
      customerId,
      product: premium,
    });
  });

  it("should attach growth product", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: 200000,
    });

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 1).getTime(),
      waitForSeconds: 10,
    });

    const res = await autumn.attachPreview({
      customerId,
      productId: growth.id,
    });

    const total = getAttachTotal({
      preview: res,
    });

    await autumn.attach({
      customerId,
      productId: growth.id,
    });

    const customer = await autumn.customers.get(customerId);

    expectProductAttached({
      customer,
      product: growth,
    });

    expectInvoicesCorrect({
      customer,
      first: { productId: growth.id, total },
    });

    expectFeaturesCorrect({
      customer,
      product: growth,
    });
  });
});
