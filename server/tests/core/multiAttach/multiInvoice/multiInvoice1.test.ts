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
import {
  addPrefixToProducts,
  getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import { expect } from "chai";
import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
  advanceTestClock,
  completeCheckoutForm,
} from "tests/utils/stripeUtils.js";
import { addDays, addWeeks } from "date-fns";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { expectMultiAttachCorrect } from "tests/utils/expectUtils/expectMultiAttach.js";

let premium = constructProduct({
  id: "premium",
  items: [
    constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
  ],
  type: "premium",
  trial: true,
});

let pro = constructProduct({
  id: "pro",
  items: [
    constructFeatureItem({
      featureId: TestFeature.Words,
      includedUsage: 300,
    }),
  ],
  type: "pro",
  trial: true,
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
];

const testCase = "multiInvoice1";
describe(`${chalk.yellowBright("multiInvoice1: Testing multi attach through invoice flow")}`, () => {
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
      // attachPm: "success",
    });

    testClockId = testClockId1!;
  });

  it("should run multi attach through checkout and have correct sub", async function () {
    const productsList = [
      {
        product_id: pro.id,
        quantity: 3,
        product: pro,
        status: CusProductStatus.Trialing,
      },
      {
        product_id: premium.id,
        quantity: 3,
        product: premium,
        status: CusProductStatus.Trialing,
      },
    ];

    await expectMultiAttachCorrect({
      customerId,
      products: productsList,
      results: productsList,
      attachParams: {
        invoice: true,
        enable_product_immediately: true,
      },
      db,
      org,
      env,
    });
  });

  it("should update premium & pro while trialing", async function () {
    const newProducts = [
      {
        product_id: premium.id,
        quantity: 2,
      },
      {
        product_id: pro.id,
        quantity: 4,
      },
    ];

    const results = [
      {
        product: pro,
        quantity: 4,
        status: CusProductStatus.Trialing,
      },
      {
        product: premium,
        quantity: 2,
        status: CusProductStatus.Trialing,
      },
    ];

    await expectMultiAttachCorrect({
      customerId,
      products: newProducts,
      results,
      db,
      org,
      env,
    });
  });
});
