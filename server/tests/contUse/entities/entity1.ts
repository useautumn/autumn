import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
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
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { expectSubQuantityCorrect } from "tests/utils/expectUtils/expectContUseUtils.js";
import { addWeeks } from "date-fns";
import { timeout } from "@/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";

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

const testCase = "entity1";

// Pro is $20 / month, Seat is $50 / user

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing create / delete entities`)}`, () => {
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

  it("should create entity, then attach pro", async function () {
    await autumn.entities.create(customerId, firstEntities);
    usage += 1;

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
          value: 1,
        },
      ],
    });
  });

  const entities = [
    {
      id: "2",
      name: "test",
      feature_id: TestFeature.Users,
    },
    {
      id: "3",
      name: "test2",
      feature_id: TestFeature.Users,
    },
  ];

  it("should create 2 entities and have correct invoice", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addWeeks(new Date(), 2).getTime(),
      waitForSeconds: 30,
    });

    await autumn.entities.create(customerId, entities);
    await timeout(3000);

    usage += entities.length;

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      itemQuantity: usage,
    });

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices!;
    expect(invoices.length).to.equal(2);
    expect(invoices[0].total).to.equal(userItem.price! * entities.length);
  });

  it("should delete 1 entity and have no new invoice", async function () {
    await autumn.entities.delete(customerId, entities[0].id);

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices!;
    expect(invoices.length).to.equal(2);

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      numReplaceables: 1,
      itemQuantity: usage - 1,
    });
  });

  const newEntities = [
    {
      id: "4",
      name: "test3",
      feature_id: TestFeature.Users,
    },
    {
      id: "5",
      name: "test4",
      feature_id: TestFeature.Users,
    },
  ];

  it("should create 2 entities and have correct invoice (only pay for 1)", async function () {
    await autumn.entities.create(customerId, newEntities);
    await timeout(3000);
    usage += 1;

    let customer = await autumn.customers.get(customerId);
    let invoices = customer.invoices!;

    expect(invoices.length).to.equal(3);
    expect(invoices[0].total).to.equal(userItem.price!);

    await expectSubQuantityCorrect({
      stripeCli,
      productId: pro.id,
      db,
      org,
      env,
      customerId,
      usage,
      itemQuantity: usage,
    });
  });
});
