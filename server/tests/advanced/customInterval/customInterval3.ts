import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  BillingInterval,
  LimitedItem,
  Organization,
  Product,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";

import {
  constructArrearItem,
  constructFeatureItem,
  constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import {
  constructProduct,
  constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";

import { addPrefixToProducts, runAttachTest } from "tests/attach/utils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays, addHours, addMonths } from "date-fns";
import { expect } from "chai";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";

const testCase = "customInterval3";

export let pro = constructProduct({
  type: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Words,
      intervalCount: 2,
    }),
  ],
  intervalCount: 2,
});

const prepaidWordsItem = constructPrepaidItem({
  featureId: TestFeature.Words,
  price: 10,
  billingUnits: 1,
  includedUsage: 0,
});

export const addOn = constructRawProduct({
  id: "addOn",
  items: [prepaidWordsItem],
  isAddOn: true,
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
      products: [pro, addOn],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, addOn],
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

  it("should upgrade to premium product and have correct invoice next cycle", async function () {
    const curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addDays(new Date(), 20).getTime(),
      waitForSeconds: 15,
    });

    const wordBillingSets = 2;
    const wordsBillingUnits = prepaidWordsItem.billing_units! * wordBillingSets;
    await autumn.attach({
      customer_id: customerId,
      product_id: addOn.id,
      options: [
        {
          feature_id: TestFeature.Words,
          quantity: wordsBillingUnits,
        },
      ],
    });

    const customer = await autumn.customers.get(customerId);
    const proProduct = customer.products.find((p) => p.id === pro.id);
    const invoices = customer.invoices;
    expectProductAttached({
      customer,
      product: pro,
    });

    expectProductAttached({
      customer,
      product: addOn,
    });

    let expectedPrice = wordsBillingUnits * prepaidWordsItem.price!;
    expect(invoices[0].product_ids).to.include(addOn.id);
    expect(invoices[0].total).to.approximately(
      calculateProrationAmount({
        amount: expectedPrice,
        periodStart: curUnix!,
        periodEnd: addMonths(curUnix!, 1).getTime(),
        now: curUnix!,
      }),
      0.1
    );

    const expectedAddonEnd = addMonths(curUnix, 1);
    const approximate = 1000 * 60 * 60 * 24; // +- 1 day
    const addOnProduct = customer.products.find((p) => p.id === addOn.id);

    expect(addOnProduct?.current_period_end).to.be.closeTo(
      expectedAddonEnd.getTime(),
      approximate
    );
  });
});
