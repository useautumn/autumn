// Handling per entity features!

import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { timeout } from "@/utils/genUtils.js";
import { useEntityBalanceAndExpect } from "tests/utils/expectUtils/expectContUse/expectEntityUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  CusExpand,
  LimitedItem,
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
}) as LimitedItem;

export let pro = constructProduct({
  items: [userItem, perEntityItem],
  type: "pro",
});

const testCase = "entity4";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing per entity features`)}`, () => {
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
        feature_id: TestFeature.Users,
      },
      {
        id: "3",
        name: "test",
        feature_id: TestFeature.Users,
      },
    ];

    await autumn.entities.create(customerId, newEntities);
    usage += newEntities.length;

    let customer = await autumn.customers.get(customerId, {
      expand: [CusExpand.Entities],
    });

    let res = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
    });

    expect(res.balance).to.equal(
      (perEntityItem.included_usage as number) * usage,
    );

    // @ts-ignore
    for (const entity of customer.entities) {
      let entRes = await autumn.check({
        customer_id: customerId,
        feature_id: TestFeature.Messages,
        entity_id: entity.id,
      });

      expect(entRes.balance).to.equal(perEntityItem.included_usage);
    }
  });

  // 1. Use from main balance...
  it("should use from top level balance", async function () {
    let deduction = 600;
    let perEntityIncluded = perEntityItem.included_usage as number;

    await autumn.track({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      value: deduction,
    });
    await timeout(5000);

    let { balance } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
    });

    expect(balance).to.equal(perEntityIncluded * usage - deduction);
  });

  it("should use from entity balance", async function () {
    await useEntityBalanceAndExpect({
      autumn,
      customerId,
      featureId: TestFeature.Messages,
      entityId: "2",
    });

    await useEntityBalanceAndExpect({
      autumn,
      customerId,
      featureId: TestFeature.Messages,
      entityId: "3",
    });
  });

  // Delete one entity and create a new one and master balance should be same
  let deletedEntityId = "2";
  let newEntity = {
    id: "4",
    name: "test",
    feature_id: TestFeature.Users,
  };
  it("should delete one entity and create a new one", async function () {
    let { balance: masterBalanceBefore } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
    });

    let { balance: entityBalanceBefore } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      entity_id: deletedEntityId,
    });

    await autumn.entities.delete(customerId, deletedEntityId);
    await autumn.entities.create(customerId, [newEntity]);

    let { balance: masterBalanceAfter } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
    });

    expect(masterBalanceAfter).to.equal(masterBalanceBefore);

    let { balance: entityBalanceAfter } = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Messages,
      entity_id: newEntity.id,
    });

    expect(entityBalanceAfter).to.equal(entityBalanceBefore);
  });
});
