import chalk from "chalk";
import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { setupBefore } from "tests/before.js";
import { createProducts } from "tests/utils/productUtils.js";
import { addPrefixToProducts } from "../utils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";

export let free = constructProduct({
  items: [
    constructFeatureItem({
      featureId: TestFeature.Words,
    }),
  ],
  isAnnual: false,
  type: "free",
  isDefault: false,
});

// Pro trial

// Pro

const testCase = "others9";

describe(`${chalk.yellowBright(`${testCase}: Testing attach free product again`)}`, () => {
  let customerId = testCase;
  let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
  let db: DrizzleCli, org: Organization, env: AppEnv;
  let stripeCli: Stripe;

  before(async function () {
    await setupBefore(this);
    db = this.db;
    org = this.org;
    env = this.env;

    stripeCli = this.stripeCli;

    await initCustomer({
      db,
      org,
      env,
      autumn: this.autumnJs,
      customerId,
      fingerprint: "test",
      attachPm: "success",
    });

    addPrefixToProducts({
      products: [free],
      prefix: testCase,
    });

    await createProducts({
      db,
      orgId: org.id,
      env,
      autumn,
      products: [free],
    });
  });

  it("should attach free product, then try again and hit error", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: free,
      stripeCli,
      db,
      org,
      env,
      skipSubCheck: true,
    });

    await expectAutumnError({
      func: async () => {
        await autumn.attach({
          customer_id: customerId,
          product_id: free.id,
        });
      },
    });
  });
});
