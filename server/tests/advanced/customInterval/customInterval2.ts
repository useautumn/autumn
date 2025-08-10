import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";

import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

import { addPrefixToProducts, runAttachTest } from "tests/attach/utils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addHours, addMonths } from "date-fns";
import { expect } from "chai";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";

const testCase = "customInterval2";

export let pro = constructRawProduct({
  id: "pro",
  items: [
    constructArrearItem({
      includedUsage: 0,
      featureId: TestFeature.Words,
      intervalCount: 2,
    }),
  ],
});

describe(`${chalk.yellowBright(`${testCase}: Testing custom interval on arrear prorated price`)}`, () => {
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
      products: [pro],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro],
      db,
      orgId: org.id,
      env,
    });

    testClockId = testClockId1!;
  });

  it("should attach pro product", async function () {
    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });

  let usage = 100012;
  it("should upgrade to premium product and have correct invoice next cycle", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: usage,
    });

    const curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addHours(
        addMonths(new Date(), 2),
        hoursToFinalizeInvoice
      ).getTime(),
      waitForSeconds: 30,
    });

    const invoiceAmount = await getExpectedInvoiceTotal({
      customerId,
      productId: pro.id,
      usage: [{ featureId: TestFeature.Words, value: usage }],
      stripeCli,
      db,
      org,
      env,
    });

    const customer = await autumn.customers.get(customerId);
    expect(customer.invoices.length).to.equal(2);
    expect(invoiceAmount).to.equal(customer.invoices[0].total);
  });
});
