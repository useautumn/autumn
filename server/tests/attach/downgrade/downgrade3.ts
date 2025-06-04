import chalk from "chalk";
import Stripe from "stripe";

import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Customer, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../utils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/internal/products/product-items/productItemUtils.js";
import { expectDowngradeCorrect } from "tests/utils/expectUtils/expectScheduleUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";

const testCase = "downgrade3";

let free = constructProduct({
  items: [
    constructFeatureItem({
      feature_id: TestFeature.Words,
      included_usage: 100,
    }),
  ],
  type: "free",
  isDefault: false,
});

let pro = constructProduct({
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

let premium = constructProduct({
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrade: premium -> pro -> free -> pro -> premium`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let customer: Customer;
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
      products: [free, pro, premium],
      prefix: testCase,
    });

    // await createProducts({
    //   autumn,
    //   products: [free, pro, premium],
    //   customerId,
    // });

    const { testClockId: testClockId1, customer: customer_ } =
      await initCustomer({
        autumn: autumnJs,
        customerId,
        db,
        org,
        env,
        attachPm: "success",
      });

    testClockId = testClockId1!;
    customer = customer_!;
  });

  it("should attach premium product", async function () {
    await runAttachTest({
      autumn,
      customerId,
      product: premium,
      stripeCli,
      db,
      org,
      env,
    });
  });

  // let nextCycle = Date.now();
  let preview = null;
  it("should downgrade to pro", async function () {
    const { preview: preview_ } = await expectDowngradeCorrect({
      autumn,
      customerId,
      curProduct: premium,
      newProduct: pro,
      stripeCli,
      db,
      org,
      env,
    });

    preview = preview_;
  });

  it("should downgrade to free", async function () {
    const { preview: preview_ } = await expectDowngradeCorrect({
      autumn,
      customerId,
      curProduct: premium,
      newProduct: free,
      stripeCli,
      db,
      org,
      env,
    });

    preview = preview_;
  });

  it("should change downgrade to pro", async function () {
    const { preview: preview_ } = await expectDowngradeCorrect({
      autumn,
      customerId,
      curProduct: premium,
      newProduct: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });

  it("should renew premium", async function () {
    await autumn.attach({
      customerId,
      productId: premium.id,
    });

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      product: premium,
    });
    // await runAttachTest({
    //   autumn,
    //   customerId,
    //   product: premium,
    //   stripeCli,
    //   db,
    //   org,
    //   env,
    // });
  });
});
