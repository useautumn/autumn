import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts, runAttachTest } from "../utils.js";

import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

const testCase = "upgrade7";

export let pro = constructProduct({
  items: [],
  type: "pro",
});

export let premium = constructProduct({
  items: [],
  type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing upgrade via cancel + attach`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let testClockId: string;
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

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
      products: [pro, premium],
      prefix: testCase,
    });

    await createProducts({
      autumn,
      products: [pro, premium],
      db,
      orgId: org.id,
      env,
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

  it("should cancel than attach premium product", async function () {
    await autumn.cancel({
      customer_id: customerId,
      product_id: pro.id,
      cancel_immediately: true,
    });

    await autumn.attach({
      customer_id: customerId,
      product_id: premium.id,
      force_checkout: true,
    });

    // await runAttachTest({
    //   autumn,
    //   customerId,
    //   product: premium,
    //   stripeCli,
    //   db,
    //   org,
    //   env,
    // });
  });
});
