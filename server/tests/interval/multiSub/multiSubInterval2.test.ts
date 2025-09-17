import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Stripe } from "stripe";
import { createProducts } from "tests/utils/productUtils.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { APIVersion, AppEnv, Organization } from "@autumn/shared";
import {
  constructArrearItem,
  constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { addPrefixToProducts } from "tests/utils/testProductUtils/testProductUtils.js";
import { expect } from "chai";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addMonths, addWeeks, addYears, differenceInDays } from "date-fns";
import { toMilliseconds } from "@/utils/timeUtils.js";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils.js";

let pro = constructProduct({
  id: "pro",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "pro",
});

let proAnnual = constructProduct({
  id: "proAnnual",
  items: [constructFeatureItem({ featureId: TestFeature.Words })],
  type: "pro",
  isAnnual: true,
});

const testCase = "multiSubInterval2";
describe(`${chalk.yellowBright("multiSubInterval2: Should attach pro and pro annual to entity mid cycle and have correct next cycle at")}`, () => {
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
      products: [pro, proAnnual],
      prefix: testCase,
    });

    await createProducts({
      autumn: autumnJs,
      products: [pro, proAnnual],
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
      name: "entity1",
      feature_id: TestFeature.Users,
    },
    {
      id: "2",
      name: "entity2",
      feature_id: TestFeature.Users,
    },
  ];

  it("should attach pro and advance test clock", async function () {
    await autumn.entities.create(customerId, entities);

    await attachAndExpectCorrect({
      autumn,
      customerId,
      product: pro,
      stripeCli,
      db,
      org,
      env,
    });

    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addMonths(new Date(), 1.5).getTime(),
    });
  });

  it("should attach pro annual to entity 2 and have correct next cycle at", async function () {
    const checkoutRes = await autumn.checkout({
      customer_id: customerId,
      product_id: proAnnual.id,
      entity_id: entities[1].id,
    });

    expect(checkoutRes.next_cycle).to.exist;
    expect(checkoutRes.next_cycle?.starts_at).to.approximately(
      addYears(new Date(), 1).getTime(),
      toMilliseconds.days(1) // +- 1 day
    );

    await autumn.attach({
      customer_id: customerId,
      product_id: proAnnual.id,
      entity_id: entities[1].id,
    });

    const sub = await getCusSub({
      db,
      org,
      customerId,
      productId: proAnnual.id,
    });

    const periodEndExists = sub!.items.data.some(
      (item) =>
        Math.abs(
          differenceInDays(
            item.current_period_end * 1000,
            checkoutRes.next_cycle?.starts_at!
          )
        ) < 1
    );

    expect(periodEndExists).to.be.true;
  });
});
