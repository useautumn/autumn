import { expect } from "chai";
import { initCustomer } from "../../utils/init.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import {
  advanceProducts,
  creditSystems,
  features,
  products,
} from "../../global.js";
import { compareMainProduct } from "../../utils/compare.js";
import { timeout } from "../../utils/genUtils.js";
import { Decimal } from "decimal.js";
import { sendGPUEvents } from "../../utils/advancedUsageUtils.js";
import chalk from "chalk";

const PRECISION = 12;
describe(`${chalk.yellowBright(
  "Testing group by -- regular metered1 feature"
)}`, () => {
  let customerId = "group-by-basic-metered";
  before(async function () {
    await initCustomer({
      customer_data: {
        id: customerId,
        name: "Group by basic metered",
        email: "group-by-basic-metered@example.com",
      },
      attachPm: true,
      sb: this.sb,
      org: this.org,
      env: this.env,
    });
  });

  it("should attach pro product to customer", async () => {
    await AutumnCli.attach({
      customerId,
      productId: products.pro.id,
    });

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: products.pro,
      cusRes: res,
    });
  });

  it("should send events for three different groups", async () => {
    // const users = ["null", "123", "abc"];
    const users = ["null", "123", "abc"];

    let results: any = {};
    let numEventsPerUser = 5;
    let groupProperty = features.metered1.config.group_by.property;
    let multiplier = 1.5;

    for (const user of users) {
      let batchEvents = [];
      let totalValue = 0;
      for (let i = 0; i < numEventsPerUser; i++) {
        let randomVal = new Decimal(Math.random().toFixed(PRECISION))
          .mul(multiplier)
          .toNumber();
        totalValue = new Decimal(totalValue).plus(randomVal).toNumber();

        batchEvents.push(
          AutumnCli.sendEvent({
            customerId,
            eventName: features.metered1.eventName,
            properties: {
              [groupProperty]: user == "null" ? null : user,
              value: randomVal,
            },
          })
        );
      }

      await Promise.all(batchEvents);
      await timeout(3000);

      results[user] = totalValue;
    }

    let metered1Allowance = products.pro.entitlements.metered1.allowance!;

    for (const user of users) {
      const { allowed, balanceObj }: any = await AutumnCli.entitled(
        customerId,
        features.metered1.id,
        true,
        user == "null" ? undefined : user
      );

      let expectedBalance = new Decimal(metered1Allowance)
        .minus(results[user])
        .toNumber();

      if (expectedBalance < 1) {
        expect(allowed).to.be.false;
      } else {
        expect(allowed).to.be.true;
      }

      expect(balanceObj!.balance).to.equal(expectedBalance);

      // Check balance for GET /customers/:customerId
      const res = await AutumnCli.getCustomer(customerId, {
        [groupProperty]: user == "null" ? undefined : user,
      });
      const entitlements = res.entitlements;
      const metered1 = entitlements.find(
        (e: any) => e.feature_id === features.metered1.id
      );
      expect(metered1.balance).to.equal(expectedBalance);
    }
  });
});

// TO ADD SUPPORT FOR IN THE FUTURE
describe.skip(`${chalk.yellowBright(
  "Testing group by -- advanced GPU usage"
)}`, () => {
  let customerId = "group-by-advanced-gpu-usage-metered";
  before(async function () {
    await initCustomer({
      customer_data: {
        id: customerId,
        name: "Group by advanced GPU usage",
        email: "group-by-advanced-gpu-usage@example.com",
      },
      attachPm: true,
      sb: this.sb,
      org: this.org,
      env: this.env,
    });
  });

  it("should attach GPU system starter product to customer", async () => {
    await AutumnCli.attach({
      customerId,
      productId: advanceProducts.gpuSystemStarter.id,
    });

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: advanceProducts.gpuSystemStarter,
      cusRes: res,
    });
  });

  it("should send events (advanced GPU usage) for three different groups", async () => {
    const users = ["null", "123", "abc"];

    let numEventsPerUser = 20;
    let groupProperty = features.gpu1.config.group_by.property;

    const results: any = {};
    for (const user of users) {
      let { creditsUsed } = await sendGPUEvents({
        customerId,
        eventCount: numEventsPerUser,
        groupObj: user == "null" ? undefined : { [groupProperty]: user },
      });
      results[user] = creditsUsed;
    }

    let creditAllowance =
      advanceProducts.gpuSystemStarter.entitlements.gpuCredits.allowance!;

    console.log("Results", results);
    console.log("Starting allowance", creditAllowance);

    for (const user of users) {
      const { allowed, balanceObj }: any = await AutumnCli.entitled(
        customerId,
        creditSystems.gpuCredits.id,
        true,
        user == "null" ? undefined : user
      );

      let expectedCreditAllowance = new Decimal(creditAllowance)
        .minus(results[user])
        .toNumber();

      expect(balanceObj.balance).to.equal(expectedCreditAllowance);
    }
  });
});
