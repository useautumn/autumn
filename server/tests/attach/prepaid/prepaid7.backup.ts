// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
// import {
//   LegacyVersion,
//   AppEnv,
//   Customer,
//   OnDecrease,
//   OnIncrease,
//   Organization,
// } from "@autumn/shared";
// import chalk from "chalk";
// import Stripe from "stripe";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { setupBefore } from "@tests/before.js";
// import { createProducts } from "@tests/utils/productUtils.js";
// import { addPrefixToProducts } from "../utils.js";
// import {
//   constructFeatureItem,
//   constructPrepaidItem,
// } from "@/utils/scriptUtils/constructItem.js";
// import { TestFeature } from "@tests/setup/v2Features.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
// import { expect } from "chai";

// const testCase = "prepaid6";

// export let pro = constructProduct({
//   type: "pro",
//   items: [
//     constructPrepaidItem({
//       featureId: TestFeature.Messages,
//       billingUnits: 100,
//       price: 12.5,
//       config: {
//         on_increase: OnIncrease.ProrateImmediately,
//         on_decrease: OnDecrease.None,
//       },
//     }),
//   ],
// });
// export let premium = constructProduct({
//   type: "premium",
//   items: [
//     constructPrepaidItem({
//       featureId: TestFeature.Messages,
//       billingUnits: 100,
//       price: 12.5,
//       config: {
//         on_increase: OnIncrease.ProrateImmediately,
//         on_decrease: OnDecrease.None,
//       },
//     }),
//   ],
// });

// describe(`${chalk.yellowBright(`attach/${testCase}: prepaid add on, with entities`)}`, () => {
//   let customerId = testCase;
//   let autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
//   let testClockId: string;
//   let db: DrizzleCli, org: Organization, env: AppEnv;
//   let stripeCli: Stripe;

//   let curUnix = new Date().getTime();
//   let customer: Customer;

//   before(async function () {
//     await setupBefore(this);
//     const { autumnJs } = this;
//     db = this.db;
//     org = this.org;
//     env = this.env;

//     stripeCli = this.stripeCli;

//     const res = await initCustomer({
//       autumn: autumnJs,
//       customerId,
//       db,
//       org,
//       env,
//       attachPm: "success",
//       withTestClock: false,
//     });

//     addPrefixToProducts({
//       products: [pro, premium],
//       prefix: testCase,
//     });

//     await createProducts({
//       autumn,
//       products: [pro, premium],
//       db,
//       orgId: org.id,
//       env,
//     });

//     customer = res.customer;
//     // testClockId = res.testClockId!;
//   });

//   it("should attach pro product", async function () {
//     await attachAndExpectCorrect({
//       autumn,
//       customerId,
//       product: pro,
//       stripeCli,
//       db,
//       org,
//       env,
//       options: [
//         {
//           feature_id: TestFeature.Messages,
//           quantity: 300,
//         },
//       ],
//     });
//   });

//   return;

//   // it("should advance test clock and attach premium", async function () {
//   //   await advanceTestClock({
//   //     stripeCli,
//   //     testClockId,
//   //     advanceTo: addWeeks(new Date(), 2).getTime(),
//   //     waitForSeconds: 10,
//   //   });

//   //   await attachAndExpectCorrect({
//   //     autumn,
//   //     customerId,
//   //     entityId: entity2Id,
//   //     product: premium,
//   //     stripeCli,
//   //     db,
//   //     org,
//   //     env,
//   //     numSubs: 3,
//   //   });

//   //   await attachAndExpectCorrect({
//   //     autumn,
//   //     customerId,
//   //     entityId: entity2Id,
//   //     product: prepaidAddOn,
//   //     otherProducts: [premium],
//   //     stripeCli,
//   //     db,
//   //     org,
//   //     env,
//   //     options: [
//   //       {
//   //         feature_id: TestFeature.Messages,
//   //         quantity: oldEntity2Quantity,
//   //       },
//   //     ],
//   //     numSubs: 4,
//   //   });
//   // });

//   // it("should increase prepaid add on quantity for entity1", async function () {
//   //   await attachAndExpectCorrect({
//   //     autumn,
//   //     customerId,
//   //     entityId: entity1Id,
//   //     product: prepaidAddOn,
//   //     otherProducts: [pro],
//   //     stripeCli,
//   //     db,
//   //     org,
//   //     env,
//   //     options: [
//   //       {
//   //         feature_id: TestFeature.Messages,
//   //         quantity: 200,
//   //       },
//   //     ],
//   //     numSubs: 4,
//   //     waitForInvoice: 10000,
//   //   });
//   // });

//   return;
// });
