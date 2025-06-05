import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import {
  APIVersion,
  AppEnv,
  AttachBranch,
  BillingInterval,
  Organization,
  ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, replaceItems, runAttachTest } from "../utils.js";
import {
  constructArrearItem,
  constructArrearProratedItem,
  constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { expect } from "chai";
import { nullish } from "@/utils/genUtils.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";

const testCase = "updateEnts4";

export let pro = constructProduct({
  items: [
    constructArrearItem({
      featureId: TestFeature.Words,
      includedUsage: 10000,
    }),
  ],
  type: "pro",
  isAnnual: true,
});

describe(`${chalk.yellowBright(`${testCase}: Checking price changes don't result in update ents func`)}`, () => {
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
    });

    testClockId = testClockId1!;
  });

  it("should attach pro annual product", async function () {
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

  // // Check errors
  // it("branch should not have same custom ents new feature price item", async function () {
  //   const customItems = [
  //     ...pro.items,
  //     constructArrearProratedItem({
  //       featureId: TestFeature.Messages,
  //       pricePerUnit: 1000,
  //     }),
  //   ];

  //   const preview = await autumn.attachPreview({
  //     customer_id: customerId,
  //     product_id: pro.id,
  //     is_custom: true,
  //     items: customItems,
  //   });

  //   expect(preview.branch).to.equal(AttachBranch.SameCustom);
  // });

  // it("branch should not have same custom ents if price changes", async function () {
  //   const customItems = replaceItems({
  //     items: pro.items,
  //     featureId: TestFeature.Words,
  //     newItem: constructArrearItem({
  //       featureId: TestFeature.Words,
  //       includedUsage: 10000,
  //       price: 0.2,
  //     }),
  //   });

  //   const preview = await autumn.attachPreview({
  //     customer_id: customerId,
  //     product_id: pro.id,
  //     is_custom: true,
  //     items: customItems,
  //   });

  //   expect(preview.branch).to.equal(AttachBranch.SameCustom);
  // });

  // it("branch should have same custom ents if billing units change", async function () {
  //   const customItems = replaceItems({
  //     items: pro.items,
  //     featureId: TestFeature.Words,
  //     newItem: constructArrearItem({
  //       featureId: TestFeature.Words,
  //       billingUnits: 2001,
  //     }),
  //   });

  //   const preview = await autumn.attachPreview({
  //     customer_id: customerId,
  //     product_id: pro.id,
  //     is_custom: true,
  //     items: customItems,
  //   });

  //   expect(preview.branch).to.equal(AttachBranch.SameCustom);
  // });

  // it("branch should not be same custom ents if usage model changes", async function () {
  //   const customItems = replaceItems({
  //     items: pro.items,
  //     featureId: TestFeature.Words,
  //     newItem: constructPrepaidItem({
  //       featureId: TestFeature.Words,
  //       price: 0.1,
  //       billingUnits: 1000,
  //     }),
  //   });

  //   const preview = await autumn.attachPreview({
  //     customer_id: customerId,
  //     product_id: pro.id,
  //     is_custom: true,
  //     items: customItems,
  //   });

  //   expect(preview.branch).to.equal(AttachBranch.SameCustom);
  // });

  // it("branch should not be same custom ents if base price deleted", async function () {
  //   const customItems = pro.items.filter((item) => nullish(item.feature_id));

  //   const preview = await autumn.attachPreview({
  //     customer_id: customerId,
  //     product_id: pro.id,
  //     is_custom: true,
  //     items: customItems,
  //   });

  //   expect(preview.branch).to.equal(AttachBranch.SameCustom);
  // });

  it("branch should not be same custom ents if base price updated", async function () {
    let customItems = pro.items.filter((item) => !nullish(item.feature_id));

    customItems = [
      ...customItems,
      constructPriceItem({
        price: 10,
        interval: BillingInterval.Year,
      }),
    ];

    const preview = await autumn.attachPreview({
      customer_id: customerId,
      product_id: pro.id,
      is_custom: true,
      items: customItems,
    });

    expect(preview.branch).to.equal(AttachBranch.SameCustom);
  });
});
