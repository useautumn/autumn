import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, ErrCode, Organization } from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts, runAttachTest } from "tests/attach/utils.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { expect } from "chai";

const userItem = constructArrearProratedItem({
  featureId: TestFeature.Users,
  pricePerUnit: 50,
  includedUsage: 0,
  usageLimit: 2,
});

export let pro = constructProduct({
  items: [userItem],
  type: "pro",
});

const testCase = "entity1";

describe(`${chalk.yellowBright(`${testCase}: Testing entities`)}`, () => {
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
    {
      id: "3",
      name: "Entity 3",
      feature_id: TestFeature.Users,
    },
    {
      id: "4",
      name: "Entity 4",
      feature_id: TestFeature.Users,
    },
  ];

  it("should attach pro product", async function () {
    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });
  });
  it("should create more entities than the limit and hit error", async function () {
    await expectAutumnError({
      errCode: ErrCode.FeatureLimitReached,
      func: async () => {
        await autumn.entities.create(customerId, entities);
      },
    });
  });

  it("should create entities one by one, then hit usage limit", async function () {
    await autumn.entities.create(customerId, entities[0]);
    await autumn.entities.create(customerId, entities[1]);

    await expectAutumnError({
      errCode: ErrCode.FeatureLimitReached,
      func: async () => {
        await autumn.entities.create(customerId, entities[2]);
      },
    });
  });

  it("should have correct check and get customer value", async function () {
    const check = await autumn.check({
      customer_id: customerId,
      feature_id: TestFeature.Users,
    });
    expect(check.balance).to.equal(-2);
    // @ts-ignore
    expect(check.usage_limit).to.equal(userItem.usage_limit);

    const customer = await autumn.customers.get(customerId);
    // @ts-ignore
    expect(customer.features[TestFeature.Users].usage_limit).to.equal(
      userItem.usage_limit,
    );
  });
});
