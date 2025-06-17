import chalk from "chalk";
import Stripe from "stripe";
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
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { timeout } from "@/utils/genUtils.js";

const testCase = "aentity4";

export let pro = constructProduct({
  items: [
    constructArrearItem({
      featureId: TestFeature.Words,
      includedUsage: 1500,
    }),
  ],
  type: "pro",
});

describe(`${chalk.yellowBright(`attach/${testCase}: Testing attach pro diff entities and testing track / check`)}`, () => {
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
      products: [pro],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro],
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
    {
      id: "2",
      name: "Entity 1",
      feature_id: TestFeature.Users,
    },
  ];

  let entity1 = newEntities[0];
  let entity2 = newEntities[1];

  it("should attach pro product to entity 1", async function () {
    await autumn.entities.create(customerId, newEntities);

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      entityId: entity1.id,
      numSubs: 1,
    });
  });

  it("should attach pro product to entity 2", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      entityId: entity2.id,
      numSubs: 2,
    });
  });

  let entity1Usage = Math.random() * 1000000;
  it("should track usage on entity 1", async function () {
    await autumn.track({
      customer_id: customerId,
      entity_id: entity1.id,
      feature_id: TestFeature.Words,
      value: entity1Usage,
    });
    await timeout(3000);

    let entity1Res = await autumn.entities.get(customerId, entity1.id);
    let entity2Res = await autumn.entities.get(customerId, entity2.id);

    expectFeaturesCorrect({
      customer: entity1Res,
      product: pro,
      usage: [
        {
          featureId: TestFeature.Words,
          value: entity1Usage,
        },
      ],
    });

    expectFeaturesCorrect({
      customer: entity2Res,
      product: pro,
    });
  });

  let entity2Usage = Math.random() * 1000000;
  it("should track usage on entity 2", async function () {
    await autumn.track({
      customer_id: customerId,
      entity_id: entity2.id,
      feature_id: TestFeature.Words,
      value: entity2Usage,
    });

    await timeout(3000);

    let entity1Res = await autumn.entities.get(customerId, entity1.id);
    let entity2Res = await autumn.entities.get(customerId, entity2.id);

    expectFeaturesCorrect({
      customer: entity1Res,
      product: pro,
      usage: [
        {
          featureId: TestFeature.Words,
          value: entity1Usage,
        },
      ],
    });

    expectFeaturesCorrect({
      customer: entity2Res,
      product: pro,
      usage: [
        {
          featureId: TestFeature.Words,
          value: entity2Usage,
        },
      ],
    });
  });
});
