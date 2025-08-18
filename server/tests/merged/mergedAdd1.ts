import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, entities, Organization } from "@autumn/shared";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { expect } from "chai";
import { cpToPrice, cusProductToSubIds } from "./mergeUtils.test.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";

// UNCOMMENT FROM HERE
let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

describe(`${chalk.yellowBright("mergedAdd1: Testing merged subs, with track")}`, () => {
  let customerId = "mergedAdd1";
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
      products: [pro],
      prefix: customerId,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro],
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

  it("should attach pro product", async function () {
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

    // 1. Should have one sub
    const fullCus = await CusService.getFull({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env,
    });

    const cusProducts = fullCus.customer_products;
    expect(cusProducts.length).to.equal(3);

    const subIds = cusProductToSubIds({ cusProducts });
    expect(subIds.length).to.equal(1);

    // Get sub
    const sub = await stripeCli.subscriptions.retrieve(subIds[0]);

    // 1. Should have quantity 2 for base price
    const basePrice = cpToPrice({ cp: cusProducts[0], type: "base" });
    const arrearPrice = cpToPrice({ cp: cusProducts[0], type: "arrear" });

    const baseItem = findStripeItemForPrice({
      price: basePrice!,
      stripeItems: sub.items.data,
    })!;

    const arrearItem = findStripeItemForPrice({
      price: arrearPrice!,
      stripeItems: sub.items.data,
    })!;

    expect(baseItem.quantity).to.equal(2);
    expect(arrearItem.quantity).to.equal(0);
  });

  // it("should attach premium product", async function () {
  //   const wordsUsage = 100000;
  //   await autumn.track({
  //     customer_id: customerId,
  //     feature_id: TestFeature.Words,
  //     value: wordsUsage,
  //   });

  //   curUnix = await advanceTestClock({
  //     stripeCli,
  //     testClockId,
  //     advanceTo: addWeeks(new Date(), 2).getTime(),
  //     waitForSeconds: 10,
  //   });

  //   await attachAndExpectCorrect({
  //     autumn,
  //     customerId,
  //     product: premium,
  //     stripeCli,
  //     db,
  //     org,
  //     env,
  //   });
  // });

  // it("should attach growth product", async function () {
  //   const wordsUsage = 200000;
  //   await autumn.track({
  //     customer_id: customerId,
  //     feature_id: TestFeature.Words,
  //     value: wordsUsage,
  //   });

  //   curUnix = await advanceTestClock({
  //     stripeCli,
  //     testClockId,
  //     advanceTo: addWeeks(curUnix, 1).getTime(),
  //     waitForSeconds: 10,
  //   });

  //   await attachAndExpectCorrect({
  //     autumn,
  //     customerId,
  //     product: growth,
  //     stripeCli,
  //     db,
  //     org,
  //     env,
  //   });
  // });
});
