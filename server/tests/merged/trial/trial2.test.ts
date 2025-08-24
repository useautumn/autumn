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
  AttachBranch,
  CusProductStatus,
  Organization,
} from "@autumn/shared";

import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expect } from "chai";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays } from "date-fns";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";

// Pro Trial
// Trial Finishes
// Premium Trial

let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
  trial: true,
});

let premium = constructProduct({
  id: "premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
  trial: true,
});

const ops = [
  {
    product: pro,
    results: [{ product: pro, status: CusProductStatus.Trialing }],
  },
  // {
  //   entityId: "2",
  //   product: premium,
  //   results: [{ product: premium, status: CusProductStatus.Active }],
  // },
];

const testCase = "trial2";
describe(`${chalk.yellowBright("trial2: Testing main trial branch, upgrade from pro trial -> trial finished -> premium trial")}`, () => {
  let customerId = testCase;
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

    addPrefixToProducts({
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro, premium],
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

  it("should attach first trial, and advance clock past trial", async function () {
    for (const op of ops) {
      await attachAndExpectCorrect({
        autumn,
        customerId,
        product: op.product,
        stripeCli,
        db,
        org,
        env,
      });
    }

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      product: pro,
      status: CusProductStatus.Trialing,
    });
  });

  it("should advance test clock to before trial ends and attach premium", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addDays(new Date(), 8).getTime(),
    });

    const attachPreview = await autumn.attachPreview({
      customer_id: customerId,
      product_id: premium.id,
    });

    expect(attachPreview?.branch).to.equal(AttachBranch.Upgrade);

    await autumn.attach({
      customer_id: customerId,
      product_id: premium.id,
    });

    const customer = await autumn.customers.get(customerId);
    expectProductAttached({
      customer,
      product: premium,
      status: CusProductStatus.Trialing,
    });
    const product = customer.products.find((p) => p.id === premium.id)!;
    expect(product.current_period_end).to.be.approximately(
      addDays(curUnix, 7).getTime(),
      1000 * 60 * 30 // 30 minutes
    );

    await expectSubToBeCorrect({
      db,
      customerId,
      org,
      env,
      shouldBeTrialing: true,
    });
  });
});
