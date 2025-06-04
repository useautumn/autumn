// import { setupBefore } from "tests/before.js";
// import { createProducts } from "tests/utils/productUtils.js";
// import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
// import { TestFeature } from "tests/setup/v2Features.js";
// import { AutumnInt } from "@/external/autumn/autumnCli.js";
// import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
// import { APIVersion } from "@autumn/shared";

// // Shared products for attach tests
// export let pro = constructProduct({
//   id: "attach_pro",
//   items: [
//     constructArrearItem({
//       featureId: TestFeature.Words,
//     }),
//   ],
//   type: "pro",
// });

// export let premium = constructProduct({
//   id: "attach_premium",
//   items: [
//     constructArrearItem({
//       featureId: TestFeature.Words,
//     }),
//   ],
//   type: "premium",
// });

// export let growth = constructProduct({
//   id: "attach_growth",
//   items: [
//     constructArrearItem({
//       featureId: TestFeature.Words,
//     }),
//   ],
//   type: "growth",
// });

// // Global setup for all attach tests
// before(async function () {
//   await setupBefore(this);

//   const autumn = new AutumnInt({ version: APIVersion.v1_4 });

//   // Create products once for all attach tests
//   await createProducts({
//     autumn,
//     products: [pro, premium, growth],
//   });

//   // Make autumn available to all tests
//   this.attachAutumn = autumn;
// });
