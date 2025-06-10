import chalk from "chalk";
import Stripe from "stripe";

import { expect } from "chai";
import { features } from "tests/global.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";

import { addDays, addHours } from "date-fns";

import { Decimal } from "decimal.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { setupBefore } from "tests/before.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, OnDecrease, OnIncrease, Organization } from "@autumn/shared";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import {
  addPrefixToProducts,
  getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { defaultApiVersion } from "tests/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getSubsFromCusId } from "tests/utils/expectUtils/expectSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";

const seatsItem = constructArrearProratedItem({
  featureId: features.seats.id,
  pricePerUnit: 20,
  includedUsage: 3,
  config: {
    on_increase: OnIncrease.ProrateNextCycle,
    on_decrease: OnDecrease.ProrateNextCycle,
  },
});

const seatsProduct = constructProduct({
  type: "pro",
  items: [seatsItem],
});

const testCase = "track5";
const includedUsage = seatsItem.included_usage as number;

const simulateOneCycle = async ({
  customerId,
  db,
  org,
  env,
  stripeCli,
  curUnix,
  usageValues,
  autumn,
  testClockId,
}: {
  customerId: string;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  stripeCli: Stripe;
  curUnix: number;
  usageValues: number[];
  autumn: AutumnInt;
  testClockId: string;
}) => {
  const { subs } = await getSubsFromCusId({
    customerId,
    db,
    org,
    env,
    stripeCli,
    productId: seatsProduct.id,
  });

  let sub = subs[0];

  let accruedPrice = 0;
  for (const usageValue of usageValues) {
    let daysToAdvance = Math.round(Math.random() * 10) + 1;
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo: addDays(curUnix, daysToAdvance).getTime(),
      waitForSeconds: 10,
    });

    let customer = await autumn.customers.get(customerId);
    let prevBalance = customer.features[seatsItem.feature_id!].balance!;
    let prevUsage = includedUsage - prevBalance;

    let usageDiff = usageValue - prevUsage;

    let value1 = Math.floor(usageDiff / 2);
    let value2 = usageDiff - value1;

    await autumn.track({
      customer_id: customerId,
      feature_id: seatsItem.feature_id!,
      value: value1,
    });

    await autumn.track({
      customer_id: customerId,
      feature_id: seatsItem.feature_id!,
      value: value2,
    });

    let newBalance = includedUsage - usageValue;
    let prevOverage = Math.max(0, -prevBalance);
    let newOverage = Math.max(0, -newBalance);

    let newPrice = (newOverage - prevOverage) * seatsItem.price!;

    let proratedPrice = calculateProrationAmount({
      periodStart: sub.current_period_start * 1000,
      periodEnd: sub.current_period_end * 1000,
      now: curUnix,
      amount: newPrice,
      allowNegative: true,
    });

    accruedPrice = new Decimal(accruedPrice).plus(proratedPrice).toNumber();
  }

  let customer = await autumn.customers.get(customerId);
  let balance = customer.features[seatsItem.feature_id!].balance!;

  let overage = Math.min(0, includedUsage - balance);
  let usagePrice = overage * seatsItem.price!;
  let basePrice = getBasePrice({ product: seatsProduct });

  const totalPrice = new Decimal(accruedPrice)
    .plus(usagePrice)
    .plus(basePrice)
    .toDecimalPlaces(2)
    .toNumber();

  curUnix = await advanceTestClock({
    stripeCli,
    testClockId,
    advanceTo: addHours(
      sub.current_period_end * 1000,
      hoursToFinalizeInvoice,
    ).getTime(),
    waitForSeconds: 30,
  });

  let cusAfter = await autumn.customers.get(customerId);
  let invoices = cusAfter.invoices;
  let invoice = invoices[0];

  expect(invoice.total).to.approximately(
    totalPrice,
    0.01,
    `Invoice total should be ${totalPrice} +/- 0.01`,
  );

  return {
    curUnix,
  };
};

describe(`${chalk.yellowBright("conUse/track5: Testing update cont use through /usage")}`, () => {
  const customerId = testCase;

  let stripeCli: Stripe;

  let testClockId = "";
  let db: DrizzleCli;
  let org: Organization;
  let env: AppEnv;
  let autumn = new AutumnInt({ version: defaultApiVersion });
  let curUnix = Date.now();

  before(async function () {
    await setupBefore(this);
    org = this.org;
    env = this.env;
    db = this.db;

    let res = await initCustomer({
      customerId,
      org,
      env,
      db,
      autumn: this.autumnJs,
      attachPm: "success",
    });

    addPrefixToProducts({
      products: [seatsProduct],
      prefix: testCase,
    });

    await createProducts({
      products: [seatsProduct],
      orgId: org.id,
      env,
      db,
      autumn,
    });

    testClockId = res.testClockId;

    db = this.db;
    org = this.org;
    env = this.env;
    stripeCli = this.stripeCli;
  });

  it("should attach in arrear prorated seats", async () => {
    await attachAndExpectCorrect({
      customerId,
      product: seatsProduct,
      db,
      org,
      env,
      autumn,
      stripeCli,
    });
  });

  // return;

  it("simulate first cycle and have correct invoice / balance", async () => {
    let res = await simulateOneCycle({
      customerId,
      db,
      org,
      env,
      stripeCli,
      curUnix,
      usageValues: [8, 2],
      autumn,
      testClockId,
    });

    curUnix = res.curUnix;
  });

  it("simulate second cycle and have correct invoice / balance", async () => {
    let res = await simulateOneCycle({
      customerId,
      db,
      org,
      env,
      stripeCli,
      curUnix,
      usageValues: [12, 3],
      autumn,
      testClockId,
    });

    curUnix = res.curUnix;
  });
});
