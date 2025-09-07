import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expect } from "chai";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays } from "date-fns";
import { toMilliseconds } from "@/utils/timeUtils.js";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils.js";

let pro = constructProduct({
  id: "pro",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "pro",
  trial: true,
});

let premium = constructProduct({
  id: "premium",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "premium",
  trial: true,
});

const testCase = "interval3";
describe(`${chalk.yellowBright("interval3: Should upgrade from pro trial to premium trial and have correct next cycle at")}`, () => {
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
      attachPm: "success",
    });

    testClockId = testClockId1!;
  });

  it("should attach pro and advance test clock", async function () {
    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });

    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addDays(new Date(), 3).getTime(),
    });
  });

  it("should upgrade to premium and have correct next cycle at", async function () {
    const checkoutRes = await autumn.checkout({
      customer_id: customerId,
      product_id: premium.id,
    });

    expect(checkoutRes.next_cycle).to.exist;
    expect(checkoutRes.next_cycle?.starts_at).to.approximately(
      addDays(curUnix, 7).getTime(),
      toMilliseconds.days(1) // +- 1 day
    );

    await autumn.attach({
      customer_id: customerId,
      product_id: premium.id,
    });

    const sub = await getCusSub({
      db,
      org,
      customerId,
      productId: premium.id,
    });

    const subItem = sub!.items.data[0];
    expect(subItem.current_period_end * 1000).to.approximately(
      checkoutRes.next_cycle?.starts_at!,
      toMilliseconds.days(1) // +- 1 day
    );
  });
});
