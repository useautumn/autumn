import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expect } from "chai";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { completeInvoiceCheckout } from "tests/utils/stripeUtils/completeInvoiceCheckout.js";
import { CusService } from "@/internal/customers/CusService.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

export let pro = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 100,
    }),
  ],
  type: "pro",
});

export let premium = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Messages,
      includedUsage: 100,
    }),
  ],
  type: "premium",
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

const ops = [
  {
    product: pro,
    entityId: "1",
  },
  {
    product: pro,
    entityId: "2",
  },
];

const testCase = "separate1";
describe(`${chalk.yellowBright(`${testCase}: Testing separate subscriptions because of invoice checkout`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_2 });
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
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, premium],
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
      // attachPm: "success",
    });

    testClockId = testClockId1!;
  });

  let subIds: string[] = [];
  it("should attach pro  product", async function () {
    await autumn.entities.create(customerId, entities);
    for (const op of ops) {
      const res = await autumn.attach({
        customer_id: customerId,
        product_id: op.product.id,
        invoice: true,
        entity_id: op.entityId,
      });

      await completeInvoiceCheckout({
        url: res.checkout_url,
      });
    }

    const fullCus = await CusService.getFull({
      idOrInternalId: customerId,
      db,
      orgId: org.id,
      env,
    });
    const cusProducts = fullCus.customer_products;
    const entity1Prod = cusProducts.find((cp) => cp.entity_id === "1");
    const entity2Prod = cusProducts.find((cp) => cp.entity_id === "2");

    const entity1SubId = entity1Prod?.subscription_ids?.[0];
    const entity2SubId = entity2Prod?.subscription_ids?.[0];

    expect(entity1SubId).to.not.equal(entity2SubId);

    subIds.push(entity1SubId!);
    subIds.push(entity2SubId!);

    await expectSubToBeCorrect({
      db,
      customerId,
      org,
      env,
      subId: entity1SubId,
    });
  });

  it("should upgrade both entities to premium", async function () {
    await autumn.attach({
      customer_id: customerId,
      product_id: premium.id,
      entity_id: "1",
    });

    await autumn.attach({
      customer_id: customerId,
      product_id: premium.id,
      entity_id: "2",
    });

    await expectSubToBeCorrect({
      db,
      customerId,
      org,
      env,
      subId: subIds[0],
    });

    await expectSubToBeCorrect({
      db,
      customerId,
      org,
      env,
      subId: subIds[1],
    });
  });
});
