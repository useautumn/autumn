// import { expect } from "chai";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
// import { AppEnv, Organization, ProductV2 } from "@autumn/shared";
// import chalk from "chalk";
// import Stripe from "stripe";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { setupBefore } from "tests/before.js";
// import { createProducts } from "tests/utils/productUtils.js";
// import { addPrefixToProducts } from "../utils.js";
// import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
// import { TestFeature } from "tests/setup/v2Features.js";
// import { replaceItems } from "../utils.js";
// import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
// import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
// import { defaultApiVersion } from "tests/constants.js";

// export let pro = constructRawProduct({
//   id: "pro",
//   items: [
//     constructArrearProratedItem({
//       featureId: TestFeature.Users,
//       pricePerUnit: 30,
//       includedUsage: 0,
//     }),
//   ],
// });

// const testCase = "newVersion3";

// describe(`${chalk.yellowBright(`${testCase}: Testing attach new version for cont use product`)}`, () => {
//   let customerId = testCase;
//   let autumn: AutumnInt = new AutumnInt({ version: defaultApiVersion });
//   let testClockId: string;
//   let db: DrizzleCli, org: Organization, env: AppEnv;
//   let stripeCli: Stripe;

//   let curUnix = new Date().getTime();

//   before(async function () {
//     await setupBefore(this);
//     const { autumnJs } = this;
//     db = this.db;
//     org = this.org;
//     env = this.env;

//     stripeCli = this.stripeCli;

//     addPrefixToProducts({
//       products: [pro],
//       prefix: testCase,
//     });

//     await createProducts({
//       db,
//       orgId: org.id,
//       env,
//       autumn,
//       products: [pro],
//       customerId,
//     });

//     const { testClockId: testClockId1 } = await initCustomer({
//       autumn: autumnJs,
//       customerId,
//       db,
//       org,
//       env,
//       attachPm: "success",
//     });

//     testClockId = testClockId1!;
//   });

//   const entities = [
//     {
//       id: "1",
//       name: "test",
//       feature_id: TestFeature.Users,
//     },
//   ];

//   it("should attach pro product", async function () {
//     await autumn.entities.create(customerId, entities);
//     await attachAndExpectCorrect({
//       autumn,
//       customerId,
//       product: pro,
//       stripeCli,
//       db,
//       org,
//       env,
//       entities,
//       usage: [
//         {
//           featureId: TestFeature.Users,
//           value: 1,
//         },
//       ],
//     });
//   });
//   return;

//   let newPro: ProductV2;
//   it("should update product to new version", async function () {
//     newPro = structuredClone(pro);
//     let newItems = replaceItems({
//       items: pro.items,
//       featureId: TestFeature.Users,
//       newItem: constructArrearProratedItem({
//         featureId: TestFeature.Users,
//         pricePerUnit: 50,
//         includedUsage: 0,
//       }),
//     });

//     newPro.version = 2;
//     newPro.items = newItems;

//     await autumn.products.update(pro.id, {
//       items: newItems,
//     });
//   });

//   return;

//   it("should attach pro v2", async function () {
//     const checkout = await autumn.checkout({
//       customer_id: customerId,
//       product_id: newPro.id,
//     });

//     expect(checkout.total).to.equal(0);

//     const cusBefore = await autumn.customers.get(customerId);

//     const res = await autumn.attach({
//       customer_id: customerId,
//       product_id: newPro.id,
//     });

//     const cusAfter = await autumn.customers.get(customerId);
//     expect(cusBefore.invoices.length).to.equal(cusAfter.invoices.length);

//     await expectSubToBeCorrect({
//       db,
//       customerId,
//       org,
//       env,
//     });

//     // await runUpdateEntsTest({
//     //   autumn,
//     //   stripeCli,
//     //   customerId,
//     //   customProduct: newPro,
//     //   newVersion: 2,
//     //   db,
//     //   org,
//     //   env,
//     // });
//   });

//   // it("should have correct invoice total on next cycle", async function () {
//   //   const invoiceTotal = await getExpectedInvoiceTotal({
//   //     org,
//   //     env,
//   //     customerId,
//   //     productId: pro.id,
//   //     stripeCli,
//   //     db,
//   //     usage: [
//   //       {
//   //         featureId: TestFeature.Words,
//   //         value: usage,
//   //       },
//   //     ],
//   //     onlyIncludeMonthly: true,
//   //   });

//   //   let curUnix = Date.now();
//   //   curUnix = await advanceTestClock({
//   //     stripeCli,
//   //     testClockId,
//   //     advanceTo: addMonths(curUnix, 1).getTime(),
//   //     waitForSeconds: 30,
//   //   });

//   //   await advanceTestClock({
//   //     stripeCli,
//   //     testClockId,
//   //     advanceTo: addHours(curUnix, hoursToFinalizeInvoice).getTime(),
//   //     waitForSeconds: 10,
//   //   });

//   //   const customer = await autumn.customers.get(customerId);
//   //   const invoice = customer.invoices[0];
//   //   expect(invoice.total).to.equal(
//   //     invoiceTotal,
//   //     "invoice total after 1 cycle should be correct"
//   //   );
//   // });
// });
