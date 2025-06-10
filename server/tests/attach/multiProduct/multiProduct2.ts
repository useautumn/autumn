import chalk from "chalk";

import { Stripe } from "stripe";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusProductStatus, Customer } from "@autumn/shared";
import { expect } from "chai";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { attachProducts } from "tests/global.js";
import {
  checkProductIsScheduled,
  compareMainProduct,
} from "tests/utils/compare.js";

import { searchCusProducts } from "tests/utils/genUtils.js";
import { checkScheduleContainsProducts } from "tests/utils/scheduleCheckUtils.js";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

/* 
FLOW:
1. Attach pro group 1 & premium group 2
2. Downgrade to starter group 1
3. Downgrade to starter group 2
4. Change downgrade to pro group 2
*/

const testCase = "multiProduct2";
describe(`${chalk.yellowBright(
  "multiProduct2: premium1->starter1, premium2->starter2, then premium2->pro2, then premium2->free",
)}`, () => {
  let customerId = testCase;
  let customer: Customer;
  let stripeCli: Stripe;

  before(async function () {
    await setupBefore(this);
    stripeCli = this.stripeCli;
    const res = await initCustomer({
      db: this.db,
      org: this.org,
      customerId,
      env: this.env,
      autumn: this.autumnJs,
      attachPm: "success",
    });
    customer = res.customer;
  });

  it("should attach premium group 1 and premium group 2", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productIds: [
        attachProducts.premiumGroup1.id,
        attachProducts.premiumGroup2.id,
      ],
    });

    let cusRes = await AutumnCli.getCustomer(customerId);
    compareMainProduct({ sent: attachProducts.premiumGroup1, cusRes });
    compareMainProduct({ sent: attachProducts.premiumGroup2, cusRes });
  });

  it("should downgrade to starter group 1 and starter group 2", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productId: attachProducts.starterGroup1.id,
    });

    await AutumnCli.attach({
      customerId: customerId,
      productId: attachProducts.starterGroup2.id,
    });

    // Check starter group 1 scheduled and starter group 2 scheduled
    let cusRes = await AutumnCli.getCustomer(customerId);
    checkProductIsScheduled({
      product: attachProducts.starterGroup1,
      cusRes,
    });
    checkProductIsScheduled({
      product: attachProducts.starterGroup2,
      cusRes,
    });

    // Check if scheduled id is the same
    const cusProducts = await CusProductService.list({
      db: this.db,
      internalCustomerId: customer.internal_id,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    });

    // 1. Pro group 1:
    const starter1 = searchCusProducts({
      cusProducts,
      productId: attachProducts.starterGroup1.id,
    });

    const starter2 = searchCusProducts({
      cusProducts,
      productId: attachProducts.starterGroup2.id,
    });

    expect(starter1).to.exist;
    expect(starter2).to.exist;
    expect(starter1?.scheduled_ids![0]).to.equal(starter2?.scheduled_ids![0]);

    const stripeSchedule = await stripeCli.subscriptionSchedules.retrieve(
      starter1?.scheduled_ids![0]!,
    );

    // console.log(stripeSchedule);
    checkScheduleContainsProducts({
      db: this.db,
      schedule: stripeSchedule,
      productIds: [
        attachProducts.starterGroup1.id,
        attachProducts.starterGroup2.id,
      ],
      org: this.org,
      env: this.env,
    });
  });

  it("should downgrade to free", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productId: attachProducts.freeGroup2.id,
    });

    let cusRes = await AutumnCli.getCustomer(customerId);
    checkProductIsScheduled({
      product: attachProducts.freeGroup2,
      cusRes,
    });

    const cusProducts = await CusProductService.list({
      db: this.db,
      internalCustomerId: customer.internal_id,
    });

    const starterGroup2 = searchCusProducts({
      cusProducts,
      productId: attachProducts.starterGroup2.id,
    });

    checkScheduleContainsProducts({
      db: this.db,
      scheduleId: starterGroup2?.scheduled_ids![0],
      productIds: [attachProducts.starterGroup2.id],
      org: this.org,
      env: this.env,
    });
  });
});
