import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expectSubToBeCorrect } from "../mergeUtils/expectSubCorrect.js";

// UNCOMMENT FROM HERE
let premium = constructProduct({
  id: "premium",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
});

let premiumAnnual = constructProduct({
  id: "premiumAnnual",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "premium",
  isAnnual: true,
});

let pro = constructProduct({
  id: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
  type: "pro",
});

const ops = [
  { entityId: "1", product: premium }, // upgrade to premium
  { entityId: "2", product: premiumAnnual }, // upgrade to premium
  { entityId: "2", product: pro }, // downgrade to pro
  // { entityId: "1", product: pro }, // downgrade to pro
  // { entityId: "2", product: pro }, // downgrade to pro
];

describe(`${chalk.yellowBright("mergedDowngrade2: Testing merged subs, downgrade 2 monthly + annual")}`, () => {
  let customerId = "mergedDowngrade2";
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
      products: [pro, premium, premiumAnnual],
      prefix: customerId,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro, premium, premiumAnnual],
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

  const entityIds = ["1", "2"];
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

    for (const op of ops) {
      await autumn.attach({
        customer_id: customerId,
        product_id: op.product.id,
        entity_id: op.entityId,
      });
    }

    // for (let i = 0; i < entityIds.length; i++) {
    //   const entityId = entityIds[i];
    //   const entity = await autumn.entities.get(customerId, entityId);
    //   const proProd = entity.products.find((p: any) => p.id == pro.id);
    //   expect(proProd).to.exist;
    //   expect(proProd.status).to.equal(CusProductStatus.Scheduled);
    // }

    await expectSubToBeCorrect({
      db,
      customerId,
      org,
      env,
    });
  });

  // it("should track usage and have correct invoice end of month", async function () {
  //   const value1 = 110000;
  //   const value2 = 310000;
  //   const values = [value1, value2];
  //   await autumn.track({
  //     customer_id: customerId,
  //     feature_id: TestFeature.Words,
  //     value: value1,
  //     entity_id: "1",
  //   });

  //   await autumn.track({
  //     customer_id: customerId,
  //     feature_id: TestFeature.Words,
  //     value: value2,
  //     entity_id: "2",
  //   });

  //   await timeout(3000);

  //   await advanceToNextInvoice({
  //     stripeCli,
  //     testClockId,
  //   });

  //   let total = 0;
  //   for (let i = 0; i < entities.length; i++) {
  //     const expectedTotal = await getExpectedInvoiceTotal({
  //       customerId,
  //       productId: pro.id,
  //       usage: [{ featureId: TestFeature.Words, value: values[i] }],
  //       onlyIncludeUsage: true,
  //       stripeCli,
  //       db,
  //       org,
  //       env,
  //     });
  //     total += expectedTotal;
  //   }

  //   const basePrice = getBasePrice({ product: pro });

  //   const customer = await autumn.customers.get(customerId);
  //   const invoice = customer.invoices;
  //   expect(invoice[0].total).to.equal(basePrice * 2 + total);
  // });
});
