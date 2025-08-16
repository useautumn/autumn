// test payment failures

import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  ErrCode,
  OnDecrease,
  OnIncrease,
  Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../../attach/utils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";

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

const testCase = "entity5";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing create entity payment fail`)}`, () => {
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

  it("should attach failed payment method", async function () {
    let fullCus = await CusService.getFull({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env,
    });

    await attachFailedPaymentMethod({
      stripeCli,
      customer: fullCus,
    });
  });

  it("should try to create entities and fail", async function () {
    await expectAutumnError({
      errMessage: "Your card was declined.",
      func: async () => {
        await autumn.entities.create(customerId, [
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
        ]);
      },
    });

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

  it("should track usage for users and fail", async function () {
    await expectAutumnError({
      errMessage: "Your card was declined.",
      func: async () => {
        return await autumn.track({
          customer_id: customerId,
          feature_id: TestFeature.Users,
          value: 2,
        });
      },
    });

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
});
