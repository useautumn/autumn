import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

import {
  APIVersion,
  AppEnv,
  Customer,
  LimitedItem,
  Organization,
  ProductItemInterval,
  RolloverDuration,
} from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts } from "tests/attach/utils.js";

import { expect } from "chai";
import { getMainCusProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { cusProductToCusEnt } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { timeout } from "@/utils/genUtils.js";
import { resetCustomerEntitlement } from "@/cron/cronUtils.js";

let rolloverConfig = { max: 100, length: 1, duration: RolloverDuration.Month };
const messagesItem = constructFeatureItem({
  featureId: TestFeature.Messages,
  includedUsage: 400,
  interval: ProductItemInterval.Month,
  rolloverConfig,
}) as LimitedItem;

const perUserItem = constructFeatureItem({
  featureId: TestFeature.Credits,
  includedUsage: 400,
  interval: ProductItemInterval.Month,
  rolloverConfig,
  entityFeatureId: TestFeature.Users,
});

export let pro = constructProduct({
  items: [messagesItem, perUserItem],
  type: "pro",
});

const testCase = "rollover1";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for feature item, per entity and regular`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let customer: Customer;
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

    const res = await initCustomer({
      autumn: autumnJs,
      customerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    testClockId = res.testClockId!;
    customer = res.customer;
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
    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
    });

    await autumn.entities.create(customerId, entities);
  });

  let messageUsage = 250;

  it("should create track messages, reset, and have correct rollover", async function () {
    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: messageUsage,
    });

    await timeout(3000);

    // Run reset cusEnt on ...
    let mainCusProduct = await getMainCusProduct({
      db,
      internalCustomerId: customer.internal_id,
      productGroup: pro.group,
    });

    let msgesCusEnt = cusProductToCusEnt({
      cusProduct: mainCusProduct!,
      featureId: TestFeature.Messages,
    });

    await resetCustomerEntitlement({
      db,
      cusEnt: msgesCusEnt!,
    });

    mainCusProduct = await getMainCusProduct({
      db,
      internalCustomerId: customer.internal_id,
      productGroup: pro.group,
    });

    msgesCusEnt = cusProductToCusEnt({
      cusProduct: mainCusProduct!,
      featureId: TestFeature.Messages,
    });

    let rollover = messagesItem.included_usage - messageUsage;

    expect(msgesCusEnt?.rollovers.length).to.equal(1);
    expect(msgesCusEnt?.rollovers[0].balance).to.equal(
      Math.min(rollover, rolloverConfig.max)
    );
  });

  let perUserUsage = {
    [entities[0].id]: 350,
    [entities[1].id]: 200,
  };

  it("should track per user credits, reset, and have correct rollover", async function () {
    for (let entityId in perUserUsage) {
      await autumn.track({
        customer_id: customerId,
        feature_id: TestFeature.Credits,
        value: perUserUsage[entityId],
        entity_id: entityId,
      });
    }

    await timeout(2000);

    let mainCusProduct = await getMainCusProduct({
      db,
      internalCustomerId: customer.internal_id,
      productGroup: pro.group,
    });

    let perUserCusEnt = cusProductToCusEnt({
      cusProduct: mainCusProduct!,
      featureId: TestFeature.Credits,
    });

    await resetCustomerEntitlement({
      db,
      cusEnt: perUserCusEnt!,
    });

    mainCusProduct = await getMainCusProduct({
      db,
      internalCustomerId: customer.internal_id,
      productGroup: pro.group,
    });

    perUserCusEnt = cusProductToCusEnt({
      cusProduct: mainCusProduct!,
      featureId: TestFeature.Credits,
    });

    let perUserRollover = perUserCusEnt?.rollovers[0];
    expect(perUserRollover).to.exist;
    for (let entityId in perUserUsage) {
      let entityRollover = perUserRollover?.entities[entityId];

      let expectedRollover = Math.min(
        entityRollover!.balance,
        rolloverConfig.max
      );

      expect(entityRollover).to.exist;
      expect(entityRollover?.balance).to.equal(expectedRollover);
    }

    await timeout(3000);
  });
});
