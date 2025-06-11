import { AutumnInt } from "@/external/autumn/autumnCli.js";

import {
  APIVersion,
  AppEnv,
  AttachErrCode,
  Organization,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../utils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addWeeks } from "date-fns";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const testCase = "updateQuantity1";

export let pro = constructProduct({
  items: [
    constructPrepaidItem({
      featureId: TestFeature.Users,
      price: 12,
      billingUnits: 1,
    }),
  ],
  type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing upgrades with prepaid single use`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

  let curUnix = new Date().getTime();
  let numUsers = 0;

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

    testClockId = testClockId1!;
  });

  const proOpts = [
    {
      feature_id: TestFeature.Users,
      quantity: 2,
    },
  ];

  it("should attach pro product (arrear prorated)", async function () {
    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      options: proOpts,
    });
  });

  it("should throw error if try to attach same options", async function () {
    await expectAutumnError({
      errCode: AttachErrCode.ProductAlreadyAttached,
      func: async () => {
        await autumn.attach({
          customer_id: customerId,
          product_id: pro.id,
          options: proOpts,
        });
      },
    });
  });

  // const newOpts = [
  //   {
  //     feature_id: TestFeature.Users,
  //     quantity: 1,
  //   },
  // ];
  // it("should throw error if try to reduce seats to less than current usage", async function () {
  //   await autumn.track({
  //     customer_id: customerId,
  //     feature_id: TestFeature.Users,
  //     value: 2,
  //   });

  //   await timeout(1000);

  //   await expectAutumnError({
  //     errCode: AttachErrCode.InvalidOptions,
  //     func: async () => {
  //       await autumn.attach({
  //         customer_id: customerId,
  //         product_id: pro.id,
  //         options: newOpts,
  //       });
  //     },
  //   });
  // });

  const updatedOpts = [
    {
      feature_id: TestFeature.Users,
      quantity: 4,
    },
  ];

  it("should update quantity to 4 users and have usage stay the same", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(curUnix, 1).getTime(),
      waitForSeconds: 10,
    });

    await runAttachTest({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
      options: updatedOpts,
      usage: [
        {
          featureId: TestFeature.Users,
          value: 2,
        },
      ],
      waitForInvoice: 15000,
    });
  });
});
