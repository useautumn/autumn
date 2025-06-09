import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";

const testCase = "others2";

export let oneOff = constructProduct({
  type: "one_off",
  items: [
    constructPrepaidItem({
      isOneOff: true,
      featureId: TestFeature.Messages,
      price: 8,
      billingUnits: 250,
    }),
  ],
});

describe(`${chalk.yellowBright(`${testCase}: Testing one-off`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
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
      products: [oneOff],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [oneOff],
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

  const options = [
    {
      feature_id: TestFeature.Messages,
      quantity: 500,
    },
  ];

  it("should attach one-off product", async function () {
    await runAttachTest({
      autumn,
      stripeCli,
      customerId,
      product: oneOff,
      db,
      org,
      env,
      options,
    });
  });

  const options2 = [
    {
      feature_id: TestFeature.Messages,
      quantity: 750,
    },
  ];
  it("should be able to attach again", async function () {
    await runAttachTest({
      autumn,
      stripeCli,
      customerId,
      product: oneOff,
      db,
      org,
      env,
      options: options2,
      skipFeatureCheck: true,
    });

    const totalBalance = options[0].quantity + options2[0].quantity;
    const customer = await autumn.customers.get(customerId);

    const balance = customer.features[TestFeature.Messages].balance;
    expect(balance).to.equal(totalBalance, "balance should be correct");
  });

  // Payment failure
  it("should handle payment failure", async function () {
    let customer = await CusService.get({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env,
    });

    await attachFailedPaymentMethod({
      stripeCli,
      customer: customer!,
    });

    const res = await autumn.attach({
      customer_id: customerId,
      product_id: oneOff.id,
      options,
    });

    expect(res.checkout_url).to.exist;
  });
});
