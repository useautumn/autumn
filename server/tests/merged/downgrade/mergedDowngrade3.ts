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
import {
  constructArrearItem,
  constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expect } from "chai";

// OPERATIONS:
// Pro, Pro
// Free, Premium

let free = constructProduct({
  id: "free",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "free",
  isDefault: false,
});

let premium = constructProduct({
  id: "premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});

let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

const ops = [
  {
    entityId: "1",
    product: pro,
    results: [{ product: pro, status: CusProductStatus.Active }],
  },
  {
    entityId: "2",
    product: pro,
    results: [{ product: pro, status: CusProductStatus.Active }],
  },
  {
    entityId: "1",
    product: free,
    results: [
      { product: pro, status: CusProductStatus.Active },
      { product: free, status: CusProductStatus.Scheduled },
    ],
  },
  {
    entityId: "2",
    product: premium,
    results: [{ product: premium, status: CusProductStatus.Active }],
  },
];

const testCase = "mergedDowngrade3";
describe(`${chalk.yellowBright("mergedDowngrade3: Testing merged subs, pro 1, pro 2, downgrade free pro 1, upgrade pro 2 ")}`, () => {
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
      products: [pro, premium, free],
      prefix: testCase,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro, premium, free],
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
      try {
        await autumn.attach({
          customer_id: customerId,
          product_id: op.product.id,
          entity_id: op.entityId,
        });

        const entity = await autumn.entities.get(customerId, op.entityId);
        for (const result of op.results) {
          expectProductAttached({
            customer: entity,
            product: result.product,
            entityId: op.entityId,
          });
        }
        expect(
          entity.products.filter((p: any) => p.group == premium.group).length
        ).to.equal(op.results.length);

        await expectSubToBeCorrect({
          db,
          customerId,
          org,
          env,
        });
      } catch (error) {
        console.log(
          `Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`
        );
        throw error;
      }
    }
  });
});
