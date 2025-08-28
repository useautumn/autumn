import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  Organization,
} from "@autumn/shared";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  addPrefixToProducts,
  getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import { expect } from "chai";
import { expectSubToBeCorrect } from "../mergeUtils.test.js";

import { getAttachPreviewTotal } from "tests/utils/testAttachUtils/getAttachPreviewTotal.js";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";

// UNCOMMENT FROM HERE
let g1Pro = constructProduct({
  id: "mergedGroups2_g1Pro",
  group: "mergedG2_1",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

let g2Pro = constructProduct({
  id: "mergedGroups2_g2Pro",
  group: "mergedG2_2",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

let g1Premium = constructProduct({
  id: "mergedGroups2_g1Premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
  group: "mergedG2_1",
});

let g2Premium = constructProduct({
  id: "mergedGroups2_g2Premium",
  group: "mergedG2_2",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});

// Ops
const ops = [
  {
    product: g1Premium,
    results: [{ product: g1Premium, status: CusProductStatus.Active }],
  },
  {
    product: g2Premium,
    results: [
      { product: g1Premium, status: CusProductStatus.Active },
      { product: g2Premium, status: CusProductStatus.Active },
    ],
    otherProducts: [g1Premium],
  },
  {
    product: g1Pro,
    results: [
      { product: g1Premium, status: CusProductStatus.Active },
      { product: g2Premium, status: CusProductStatus.Active },
      { product: g1Pro, status: CusProductStatus.Scheduled },
    ],
    // otherProducts: [g2Premium],
  },
];

describe(`${chalk.yellowBright("mergedGroup2: Testing products from diff groups")}`, () => {
  let customerId = "mergedGroup2";
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

  let stripeCli: Stripe;
  let testClockId: string;
  let curUnix: number;
  let db: DrizzleCli;
  let org: Organization;
  let env: AppEnv;

  before(async function () {
    await setupBefore(this);
    const { autumnJs } = this;
    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    await createProducts({
      autumn: autumnJs,
      products: [g1Pro, g2Pro, g1Premium, g2Premium],
      db,
      orgId: org.id,
      env,
      customerId,
    });

    const { testClockId: testClockId1 } = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
    for (const op of ops) {
      await attachAndExpectCorrect({
        autumn,
        customerId,
        product: op.product,
        stripeCli,
        otherProducts: op.otherProducts,
        db,
        org,
        env,
      });

      const customer = await autumn.customers.get(customerId);
      for (const result of op.results) {
        expectProductAttached({
          customer,
          product: result.product,
          status: result.status,
        });
      }
    }
  });

  return;
  it("should cancel scheduled product (g1Pro)", async function () {
    await autumn.cancel({
      customer_id: customerId,
      product_id: g1Pro.id,
      cancel_immediately: true,
    });
  });
});
