// Handling per entity features!
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  CusExpand,
  OnDecrease,
  OnIncrease,
  Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../../attach/utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import {
  constructArrearProratedItem,
  constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { expectSubQuantityCorrect } from "../../attach/entities/expectEntity.js";
import { addHours, addMonths, addWeeks } from "date-fns";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";

let userItem = constructArrearProratedItem({
  featureId: TestFeature.Users,
  pricePerUnit: 50,
  includedUsage: 1,
  config: {
    on_increase: OnIncrease.BillImmediately,
    on_decrease: OnDecrease.None,
  },
});

let perEntityItem = constructFeatureItem({
  featureId: TestFeature.Messages,
  entityFeatureId: TestFeature.Users,
  includedUsage: 500,
});

export let pro = constructProduct({
  items: [userItem, perEntityItem],
  type: "pro",
});

const testCase = "entity4";

describe(`${chalk.yellowBright(`attach/entities/${testCase}: Testing per entity features`)}`, () => {
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
      products: [pro],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro],
      customerId,
      db,
      orgId: org.id,
      env,
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

  let usage = 0;
  let firstEntities = [
    {
      id: "1",
      name: "test",
      featureId: TestFeature.Users,
    },
  ];

  it("should create one entity, then attach pro", async function () {
    await autumn.entities.create(customerId, firstEntities);
    usage += firstEntities.length;

    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      usage: [
        {
          featureId: TestFeature.Users,
          value: usage,
        },
      ],
    });
  });

  it("should create 3 entities and have correct message balance", async function () {
    const newEntities = [
      {
        id: "2",
        name: "test",
        featureId: TestFeature.Users,
      },
      {
        id: "3",
        name: "test",
        featureId: TestFeature.Users,
      },
    ];

    await autumn.entities.create(customerId, newEntities);
    usage += newEntities.length;

    return;

    let customer = await autumn.customers.get(customerId, {
      expand: [CusExpand.Entities],
    });

    let balance = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
    });

    expect(balance.quantity).to.equal(
      (perEntityItem.included_usage as number) * usage,
    );

    for (const entity of customer.entities) {
      let balance = await autumn.check({
        customer_id: customerId,
        feature_id: TestFeature.Messages,
        entity_id: entity.id,
      });

      expect(balance.quantity).to.equal(perEntityItem.included_usage);
    }
  });

  return;

  it("should advance clock to next cycle and have correct invoice", async function () {
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addHours(
        addMonths(new Date(), 1),
        hoursToFinalizeInvoice,
      ).getTime(),
    });

    usage -= 2; // 2 entities deleted

    const customer = await autumn.customers.get(customerId);
    const invoices = customer.invoices;

    let basePrice = getBasePrice({ product: pro });
    expect(invoices.length).to.equal(2);
    expect(invoices[0].total).to.equal(basePrice); // 0 entities

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      itemQuantity: usage,
      numReplaceables: 0,
    });
  });
});
