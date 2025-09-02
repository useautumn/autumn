import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
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

// UNCOMMENT FROM HERE
let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

describe(`${chalk.yellowBright("mergedAdd1: Testing merged subs, with track")}`, () => {
  let customerId = "mergedAdd1";
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
      products: [pro],
      prefix: customerId,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro],
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

  const entities = [
    {
      id: "1",
      name: "Entity 1",
      feature_id: TestFeature.Users,
    },
    {
      id: "2",
      name: "Entity 2",
      feature_id: TestFeature.Users,
    },
  ];

  it("should attach pro product", async function () {
    await autumn.entities.create(customerId, entities);

    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      entity_id: "1",
    });

    const expectedTotal = await getAttachPreviewTotal({
      customerId,
      productId: pro.id,
      entityId: "2",
    });

    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      entity_id: "2",
    });

    const customer = await autumn.customers.get(customerId);
    const invoice = customer.invoices;

    expect(invoice[0].total).to.equal(expectedTotal);

    await expectSubToBeCorrect({
      db,
      customerId,
      org,
      env,
    });
  });

  it("should track usage and have correct invoice end of month", async function () {
    const value1 = 110000;
    const value2 = 310000;
    const values = [value1, value2];
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: value1,
      entity_id: "1",
    });

    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Words,
      value: value2,
      entity_id: "2",
    });

    await timeout(3000);

    await advanceToNextInvoice({
      stripeCli,
      testClockId,
    });

    let total = 0;
    for (let i = 0; i < entities.length; i++) {
      const expectedTotal = await getExpectedInvoiceTotal({
        customerId,
        productId: pro.id,
        usage: [{ featureId: TestFeature.Words, value: values[i] }],
        onlyIncludeUsage: true,
        stripeCli,
        db,
        org,
        env,
      });
      total += expectedTotal;
    }

    const basePrice = getBasePrice({ product: pro });

    const customer = await autumn.customers.get(customerId);
    const invoice = customer.invoices;
    expect(invoice[0].total).to.equal(basePrice * 2 + total);
  });
});
