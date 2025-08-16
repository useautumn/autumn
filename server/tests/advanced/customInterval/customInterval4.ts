import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";

import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

import { addPrefixToProducts } from "tests/attach/utils.js";

import { addMonths } from "date-fns";
import { expect } from "chai";
import {
  expectDowngradeCorrect,
  expectNextCycleCorrect,
} from "tests/utils/expectUtils/expectScheduleUtils.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

const testCase = "customInterval4";

export let pro = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Words,
      includedUsage: 500,
    }),
  ],
  intervalCount: 2,
  type: "pro",
});

export let premium = constructProduct({
  id: "premium",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Words,
      includedUsage: 500,
    }),
  ],
  intervalCount: 2,
  type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing downgrades for custom intervals`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

  before(async function () {
    await setupBefore(this);
    const { autumnJs } = this;
    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    const { testClockId: testClockId1 } = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    addPrefixToProducts({
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, premium],
      db,
      orgId: org.id,
      env,
    });

    testClockId = testClockId1!;
  });

  it("should attach premium product", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: premium,
      stripeCli,
      db,
      org,
      env,
    });
  });

  it("should have correct next cycle at on checkout", async function () {
    const checkout = await autumn.checkout({
      customer_id: customerId,
      product_id: pro.id,
    });

    let expectedNextCycle = addMonths(new Date(), 2);
    expect(checkout.next_cycle?.starts_at).to.be.approximately(
      expectedNextCycle.getTime(),
      1000 * 60 * 60 * 24
    );

    expect(checkout.total).to.equal(0);
  });

  let preview: any;
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

  it("should have pro attached on next cycle", async function () {
    await expectNextCycleCorrect({
      preview: preview!,
      autumn,
      stripeCli,
      customerId,
      testClockId,
      product: pro,
      db,
      org,
      env,
    });

    const customer = await autumn.customers.get(customerId);
    const invoices = customer.invoices;
    expect(invoices.length).to.equal(2);
    expect(invoices[0].total).to.equal(getBasePrice({ product: pro }));
  });
});
