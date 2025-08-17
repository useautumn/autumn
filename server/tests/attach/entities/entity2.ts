import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { defaultApiVersion } from "tests/constants.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addHours, addMonths } from "date-fns";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { timeout } from "@/utils/genUtils.js";
import { expectInvoiceAfterUsage } from "tests/utils/expectUtils/expectSingleUse/expectUsageInvoice.js";

const testCase = "aentity2";

export let proAnnual = constructProduct({
  items: [
    constructArrearItem({
      featureId: TestFeature.Words,
      includedUsage: 1500,
    }),
  ],
  type: "pro",
  isAnnual: true,
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing attach pro annual to entity via checkout`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
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

    const { testClockId: testClockId1 } = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      // attachPm: "success",
    });

    addPrefixToProducts({
      products: [proAnnual],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [proAnnual],
      db,
      orgId: org.id,
      env,
    });

    testClockId = testClockId1;
  });

  const newEntities = [
    {
      id: "1",
      name: "Entity 1",
      feature_id: TestFeature.Users,
    },
  ];

  let entityId = newEntities[0].id;
  it("should attach pro annual product to entity 2", async function () {
    await autumn.entities.create(customerId, newEntities);
    entityId = newEntities[0].id;

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: proAnnual,
      stripeCli,
      db,
      org,
      env,
      entityId,
    });
  });

  let usage = 1250130;
  it("should track usage", async function () {
    await autumn.track({
      customer_id: customerId,
      entity_id: entityId,
      feature_id: TestFeature.Words,
      value: usage,
    });
    await timeout(5000);

    let entity = await autumn.entities.get(customerId, entityId);

    expectFeaturesCorrect({
      customer: entity,
      product: proAnnual,
      usage: [
        {
          featureId: TestFeature.Words,
          value: usage,
        },
      ],
    });
  });

  it("should have correct invoice after cycle", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addHours(
        addMonths(curUnix, 1),
        hoursToFinalizeInvoice
      ).getTime(),
      waitForSeconds: 30,
    });

    await expectInvoiceAfterUsage({
      autumn,
      customerId,
      entityId,
      featureId: TestFeature.Words,
      product: proAnnual,
      usage,
      stripeCli,
      db,
      org,
      env,
      numInvoices: 2,
    });
  });
});
