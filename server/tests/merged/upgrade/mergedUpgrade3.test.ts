import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  CusProductStatus,
  Organization,
} from "@autumn/shared";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

// UNCOMMENT FROM HERE

let pro = constructProduct({
  id: "pro",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "pro",
});

let free = constructProduct({
  id: "free",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "free",
  isDefault: false,
});

const premium = constructProduct({
  id: "premium",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "premium",
});
const growth = constructProduct({
  id: "growth",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "growth",
});

const ops = [
  {
    entityId: "1",
    product: premium,
    results: [{ product: premium, status: CusProductStatus.Active }],
  },
  {
    entityId: "2",
    product: premium,
    results: [{ product: premium, status: CusProductStatus.Active }],
  },
  {
    entityId: "1",
    product: pro,
    results: [
      { product: premium, status: CusProductStatus.Active },
      { product: pro, status: CusProductStatus.Scheduled },
    ],
  },
  {
    entityId: "2",
    product: pro,
    results: [
      { product: premium, status: CusProductStatus.Active },
      { product: pro, status: CusProductStatus.Scheduled },
    ],
  },
  {
    entityId: "2",
    product: growth,
    results: [{ product: growth, status: CusProductStatus.Active }],
  },
];

const testCase = "mergedUpgrade3";
describe(`${chalk.yellowBright("mergedUpgrade3: Upgrading when there's a scheduled downgrade")}`, () => {
  let customerId = testCase;
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
      products: [pro, free, premium, growth],
      prefix: testCase,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro, free, premium, growth],
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

  it("should run operations", async function () {
    await autumn.entities.create(customerId, entities);

    for (let index = 0; index < ops.length; index++) {
      const op = ops[index];
      await attachAndExpectCorrect({
        autumn,
        customerId,
        product: op.product,
        stripeCli,
        db,
        org,
        env,
        entities,
        entityId: op.entityId,
      });

      for (const result of op.results) {
        const entity = await autumn.entities.get(customerId, op.entityId);
        expectProductAttached({
          customer: entity,
          product: result.product,
          status: result.status,
        });
      }
    }
  });
});
