import chalk from "chalk";
import Stripe from "stripe";
import { addHours, addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AppEnv, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { defaultApiVersion } from "tests/constants.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { expectInvoiceAfterUsage } from "tests/utils/expectUtils/expectSingleUse/expectUsageInvoice.js";

const testCase = "aentity3";

export let proAnnual = constructProduct({
  items: [
    constructArrearItem({
      featureId: TestFeature.Words,
      includedUsage: 1500,
    }),
  ],
  type: "pro",
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
      attachPm: "success",
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
  it("should attach pro product to entity 2", async function () {
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

  let nextUsage = 1032100;
  it("should cancel and have correct final invoice", async function () {
    await autumn.track({
      customer_id: customerId,
      entity_id: entityId,
      feature_id: TestFeature.Words,
      value: nextUsage,
    });

    await autumn.cancel({
      customer_id: customerId,
      product_id: proAnnual.id,
      entity_id: entityId,
    });

    await timeout(5000);

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addHours(
        addMonths(curUnix, 1),
        hoursToFinalizeInvoice,
      ).getTime(),
    });

    await expectInvoiceAfterUsage({
      autumn,
      customerId,
      entityId,
      featureId: TestFeature.Words,
      product: proAnnual,
      usage: nextUsage,
      stripeCli,
      db,
      org,
      env,
      numInvoices: 2,
      expectExpired: true,
    });
  });
});
