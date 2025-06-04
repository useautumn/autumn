// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
// import { APIVersion, AppEnv, Organization } from "@autumn/shared";
// import chalk from "chalk";
// import Stripe from "stripe";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { setupBefore } from "tests/before.js";
// import { createProducts } from "tests/utils/productUtils.js";
// import { addPrefixToProducts } from "./utils.js";

// const testCase = "upgrade3";

// describe(`${chalk.yellowBright(`${testCase}: INSERT TEST NAME`)}`, () => {
//   let customerId = testCase;
//   let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });
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

//     const { testClockId: testClockId1 } = await initCustomer({
//       autumn: autumnJs,
//       customerId,
//       db,
//       org,
//       env,
//       attachPm: "success",
//     });

//     addPrefixToProducts({
//       products: [pro, proAnnual, premiumAnnual],
//       prefix: testCase,
//     });

//     await createProducts({
//       autumn,
//       products: [pro, proAnnual, premiumAnnual],
//     });

//     testClockId = testClockId1!;
//   });

//   it("should create entity, then attach pro product", async function () {
//     console.log("Here!");
//   });
// });
