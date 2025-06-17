import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  OnDecrease,
  OnIncrease,
  Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { addWeeks } from "date-fns";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";

let userItem = constructArrearProratedItem({
  featureId: TestFeature.Users,
  pricePerUnit: 50,
  includedUsage: 1,
  config: {
    on_increase: OnIncrease.BillImmediately,
    on_decrease: OnDecrease.None,
  },
});

export let pro = constructProduct({
  items: [userItem],
  type: "pro",
});

const testCase = "updateContUse2";

describe(`${chalk.yellowBright(`contUse/update/${testCase}: Testing update cont use, remove included usage`)}`, () => {
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
      feature_id: TestFeature.Users,
    },
    {
      id: "2",
      name: "test2",
      feature_id: TestFeature.Users,
    },
    {
      id: "3",
      name: "test3",
      feature_id: TestFeature.Users,
    },
  ];

  it("should create entity, then attach pro", async function () {
    await autumn.entities.create(customerId, firstEntities);
    usage += 3;

    await attachAndExpectCorrect({
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

  let reduceUsageBy = 1;
  let newItem = constructArrearProratedItem({
    featureId: TestFeature.Users,
    pricePerUnit: 50,
    includedUsage: (userItem.included_usage as number) - reduceUsageBy,
    config: {
      on_increase: OnIncrease.BillImmediately,
      on_decrease: OnDecrease.None,
    },
  });

  it("should update product with reduced included usage", async function () {
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(new Date(), 1).getTime(),
      waitForSeconds: 5,
    });

    const customItems = replaceItems({
      featureId: TestFeature.Users,
      items: pro.items,
      newItem,
    });

    const preview = await autumn.attachPreview({
      customer_id: customerId,
      product_id: pro.id,
      is_custom: true,
      items: customItems,
    });

    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      is_custom: true,
      items: customItems,
    });

    const customer = await autumn.customers.get(customerId);
    const invoices = customer.invoices;
    expect(invoices.length).to.equal(2);
    expect(invoices[0].total).to.equal(preview.due_today.total);

    // Usage stays the same...
    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: 0,
    });
  });
  return;
});
