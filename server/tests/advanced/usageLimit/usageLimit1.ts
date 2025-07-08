import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { addPrefixToProducts, runAttachTest } from "tests/attach/utils.js";

export let pro = constructProduct({
  items: [
    constructArrearProratedItem({
      featureId: TestFeature.Users,
      pricePerUnit: 50,
      usageLimit: 2,
    }),
  ],
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

  const entities = [
    {
      id: "1",
      name: "Entity 1",
      featureId: TestFeature.Users,
    },
    {
      id: "2",
      name: "Entity 1",
      featureId: TestFeature.Users,
    },
    {
      id: "3",
      name: "Entity 1",
      featureId: TestFeature.Users,
    },
    {
      id: "4",
      name: "Entity 1",
      featureId: TestFeature.Users,
    },
  ];

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
});
