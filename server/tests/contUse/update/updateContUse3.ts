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
import { addPrefixToProducts, replaceItems } from "tests/attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "tests/attach/entities/expectEntity.js";
import { attachNewContUseAndExpectCorrect } from "tests/utils/expectUtils/expectContUse/expectUpdateContUse.js";

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

const testCase = "updateContUse3";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing update contUse included usage when no entities created`)}`, () => {
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

  it("should attach pro", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });

  let extraUsage = 2;
  let newItem = constructArrearProratedItem({
    featureId: TestFeature.Users,
    pricePerUnit: 50,
    includedUsage: (userItem.included_usage as number) + extraUsage,
    config: {
      on_increase: OnIncrease.BillImmediately,
      on_decrease: OnDecrease.None,
    },
  });

  it("should update product with extra included usage", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Users,
      value: 1,
    });

    let customItems = replaceItems({
      featureId: TestFeature.Users,
      items: pro.items,
      newItem,
    });

    await attachNewContUseAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      customItems,
      numInvoices: 2,
    });

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage: 1,
      numReplaceables: 0,
    });
  });
});
