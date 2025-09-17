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

import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays } from "date-fns";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";

let premium = constructProduct({
  id: "premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
  trial: true,
});

let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
  trial: true,
});

const ops = [
  {
    entityId: "1",
    product: pro,
    results: [{ product: premium, status: CusProductStatus.Active }],
  },
  // {
  //   entityId: "2",
  //   product: premium,
  //   results: [{ product: premium, status: CusProductStatus.Active }],
  // },
];

const testCase = "mergedTrial3";
describe(`${chalk.yellowBright("mergedTrial3: Testing upgrade to product with trial in merged state")}`, () => {
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
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro, premium],
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

  it("should attach first trial, and advance clock past trial", async function () {
    await autumn.entities.create(customerId, entities);

    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      entity_id: "1",
    });
    await autumn.attach({
      customer_id: customerId,
      product_id: pro.id,
      entity_id: "2",
    });

    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addDays(new Date(), 8).getTime(),
    });

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: premium,
      stripeCli,
      db,
      org,
      env,
      entityId: "1",
      checkNotTrialing: true,
    });
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: premium,
      stripeCli,
      db,
      org,
      env,
      entityId: "2",
      checkNotTrialing: true,
    });
  });
});
