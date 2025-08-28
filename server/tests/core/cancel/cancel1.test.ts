// import chalk from "chalk";
// import { setupBefore } from "tests/before.js";
// import { Stripe } from "stripe";
// import { createProducts } from "tests/utils/productUtils.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { TestFeature } from "tests/setup/v2Features.js";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
// import {
//   APIVersion,
//   AppEnv,
//   CusProductStatus,
//   Organization,
//   priceToInvoiceAmount,
//   Proration,
// } from "@autumn/shared";
// import {
//   constructArrearItem,
//   constructArrearProratedItem,
//   constructPrepaidItem,
// } from "@/utils/scriptUtils/constructItem.js";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import {
//   addPrefixToProducts,
//   getBasePrice,
// } from "tests/utils/testProductUtils/testProductUtils.js";
// import { expect } from "chai";
// import { advanceToNextInvoice } from "tests/utils/testAttachUtils/testAttachUtils.js";
// import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
// import { advanceTestClock } from "tests/utils/stripeUtils.js";
// import { addWeeks } from "date-fns";
// import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
// import { formatUnixToDate, timeout } from "@/utils/genUtils.js";
// import { CusService } from "@/internal/customers/CusService.js";
// import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
// import { isPrepaidPrice } from "@shared/utils/productUtils/priceUtils.js";
// import { isContUsePrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
// import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
// import { Decimal } from "decimal.js";

// let premium = constructProduct({
//   id: "premium",
//   items: [
//     constructArrearItem({ featureId: TestFeature.Words }),
//     constructPrepaidItem({ featureId: TestFeature.Messages }),
//     constructArrearProratedItem({ featureId: TestFeature.Users }),
//   ],
//   type: "premium",
// });

// const creditsQuantity = 500;
// const usersOverage = 1;
// const wordsUsage = 300000;
// const ops = [
//   {
//     entityId: "1",
//     product: premium,
//     results: [{ product: premium, status: CusProductStatus.Active }],
//     options: [
//       {
//         feature_id: TestFeature.Messages,
//         quantity: creditsQuantity,
//       },
//     ],
//     usage: [
//       {
//         featureId: TestFeature.Users,
//         value: usersOverage + 1,
//       },
//     ],
//   },
// ];

// const testCase = "cancel1";
// describe(`${chalk.yellowBright("cancel1: Testing cancelling singular product")}`, () => {
//   let customerId = testCase;
//   let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

//   let stripeCli: Stripe;
//   let testClockId: string;
//   let curUnix: number;
//   let db: DrizzleCli;
//   let org: Organization;
//   let env: AppEnv;

//   before(async function () {
//     await setupBefore(this);
//     const { autumnJs } = this;
//     db = this.db;
//     org = this.org;
//     env = this.env;

//     stripeCli = this.stripeCli;

//     addPrefixToProducts({
//       products: [premium],
//       prefix: testCase,
//     });

//     await createProducts({
//       autumn: autumnJs,
//       products: [premium],
//       db,
//       orgId: org.id,
//       env,
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
//       name: "Entity 1",
//       feature_id: TestFeature.Users,
//     },
//     {
//       id: "2",
//       name: "Entity 2",
//       feature_id: TestFeature.Users,
//     },
//   ];

//   it("should run operations", async function () {
//     await autumn.entities.create(customerId, entities);

//     for (let index = 0; index < ops.length; index++) {
//       const op = ops[index];
//       try {
//         await attachAndExpectCorrect({
//           autumn,
//           customerId,
//           product: op.product,
//           stripeCli,
//           db,
//           org,
//           env,
//           options: op.options,
//           usage: op.usage,
//         });
//       } catch (error) {
//         console.log(
//           `Operation failed: ${op.entityId} ${op.product.id}, index: ${index}`
//         );
//         throw error;
//       }
//     }
//   });

//   it("should advance test clock and upgrade entity 1 to premium, and have correct invoice", async function () {
//     const cus1 = await autumn.customers.get(customerId);
//     const prod = cus1.products.find((p) => p.id === premium.id);
//     const proration = {
//       start: prod?.current_period_start!,
//       end: prod?.current_period_end!,
//     };

//     await autumn.track({
//       customer_id: customerId,
//       feature_id: TestFeature.Words,
//       value: wordsUsage,
//     });

//     await timeout(3000);

//     curUnix = await advanceTestClock({
//       stripeCli,
//       testClockId,
//       advanceTo: addWeeks(Date.now(), 2).getTime(),
//       waitForSeconds: 30,
//     });

//     await autumn.cancel({
//       customer_id: customerId,
//       product_id: premium.id,
//       cancel_immediately: true,
//       // @ts-ignore
//       prorate: true,
//     });

//     // 1. Get full customer
//     const fullCus = await CusService.getFull({
//       db,
//       orgId: org.id,
//       env,
//       idOrInternalId: customerId,
//       inStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
//     });

//     // 2. Calculate base price proration
//     const basePrice = getBasePrice({ product: premium });
//     const baseProration = calculateProrationAmount({
//       periodStart: proration.start,
//       periodEnd: proration.end,
//       now: curUnix,
//       amount: basePrice,
//       allowNegative: true,
//     });

//     const cusProduct = fullCus.customer_products.find(
//       (cusProduct) => cusProduct.product.id === premium.id
//     );

//     // 3. Calculate prepaid and cont use prices
//     const prices = cusProductToPrices({ cusProduct: cusProduct! });
//     const creditsPrice = prices.find((price) => isPrepaidPrice({ price }));
//     const usersPrice = prices.find((price) => isContUsePrice({ price }));

//     const creditsPriceAmount = priceToInvoiceAmount({
//       price: creditsPrice!,
//       quantity: creditsQuantity,
//       proration,
//       now: curUnix,
//     });

//     const usersPriceAmount = priceToInvoiceAmount({
//       price: usersPrice!,
//       overage: usersOverage,
//       proration,
//       now: curUnix,
//     });

//     // 4. Calculate words amount
//     const wordsAmount = await getExpectedInvoiceTotal({
//       db,
//       org,
//       env,
//       onlyIncludeArrear: true,
//       usage: [
//         {
//           featureId: TestFeature.Words,
//           value: wordsUsage,
//         },
//       ],
//       stripeCli,
//       customerId,
//       productId: premium.id,
//       expectExpired: true,
//     });

//     const totalPrice = new Decimal(wordsAmount)
//       .minus(baseProration)
//       .minus(creditsPriceAmount)
//       .minus(usersPriceAmount)
//       .toDecimalPlaces(2)
//       .toNumber();

//     // console.log("BASE PRORATION", baseProration);
//     // console.log("CREDITS PRORATION", creditsPriceAmount);
//     // console.log("USERS PRORATION", usersPriceAmount);
//     // console.log("WORDS AMOUNT", wordsAmount);
//     // console.log("TOTAL PRICE", totalPrice);

//     // Get upcoming invoice
//     await timeout(5000); // for webhook to trigger
//     const upcomingInvoices = await stripeCli.invoices.list({
//       customer: fullCus.processor?.id,
//       limit: 1,
//       status: "draft",
//     });
//     // console.log("INVOICE TOTAL", upcomingInvoices.data[0].total);
//     // console.log("INVOICE ID", upcomingInvoices.data[0].id);

//     expect(upcomingInvoices.data[0].total).to.equal(totalPrice * 100);
//   });
// });
