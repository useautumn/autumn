// import {
//   checkStripeProductExists,
//   isOneOff,
// } from "@/internal/products/productUtils.js";
// import {
//   AppEnv,
//   AttachScenario,
//   BillingType,
//   CheckProductPreview,
//   Feature,
//   FullCusProduct,
//   FullCustomer,
//   FullProduct,
//   Organization,
// } from "@autumn/shared";
// import { AttachParams } from "../cusProducts/AttachParams.js";

// import { createStripeCli } from "@/external/stripe/utils.js";
// import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";

// // import { billForRemainingUsages } from "../change-product/billRemainingUsages.js";

// import { formatCurrency } from "./previewUtils.js";

// import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
// import { mapToProductItems } from "@/internal/products/productV2Utils.js";
// import { getOptions } from "@/internal/api/entitled/checkUtils.js";
// import {
//   isFeaturePriceItem,
//   isPriceItem,
// } from "@/internal/products/product-items/productItemUtils/getItemType.js";
// import { DrizzleCli } from "@/db/initDrizzle.js";
// import { getBillingType } from "@/internal/products/prices/priceUtils.js";
// import { cusProductToPrices } from "../cusProducts/cusProductUtils/convertCusProduct.js";
// import Stripe from "stripe";

// export const isAddProductFlow = ({
//   curCusProduct,
//   attachParams,
// }: {
//   curCusProduct: FullCusProduct;
//   attachParams: AttachParams;
// }) => {
//   // 1. If current product has trial and new product has trial, cancel and start new subscription
//   let trialToTrial =
//     curCusProduct.trial_ends_at &&
//     curCusProduct.trial_ends_at > Date.now() &&
//     attachParams.freeTrial;
//   // !disableFreeTrial;

//   // let trialToPaid =
//   //   curCusProduct.trial_ends_at &&
//   //   curCusProduct.trial_ends_at > Date.now() &&
//   //   !attachParams.freeTrial &&
//   //   !newVersion; // Only carry over trial if migrating from one version to another...

//   // // 2. If upgrade is free to paid, or paid to free (migration / update)
//   // let toFreeProduct = isFreeProduct(attachParams.prices);
//   // let paidToFreeProduct =
//   //   isFreeProduct(curCusProduct.customer_prices.map((cp) => cp.price)) &&
//   //   !isFreeProduct(attachParams.prices);

//   // if (trialToTrial || trialToPaid || toFreeProduct || paidToFreeProduct) {
//   //   if (trialToTrial) {
//   //     logger.info(
//   //       `Upgrading from trial to trial, cancelling and starting new subscription`
//   //     );
//   //   } else if (toFreeProduct) {
//   //     logger.info(
//   //       `switching to free product, cancelling (if needed) and adding free product`
//   //     );
//   //   }
//   // }
// };

// const formatMessage = ({
//   baseLineItems,
//   usageLineItems,
//   org,
//   product,
// }: {
//   baseLineItems: any;
//   usageLineItems: any;
//   org: Organization;
//   product: FullProduct;
// }) => {
//   let totalAmount = baseLineItems.reduce(
//     (acc: number, item: any) => acc + item.amount,
//     0,
//   );
//   totalAmount += usageLineItems.reduce(
//     (acc: number, item: any) => acc + item.amount,
//     0,
//   );

//   let addString = org.config.bill_upgrade_immediately
//     ? "will be charged to your card immediately"
//     : "will be added to your next bill";

//   let message = `By clicking confirm, you will upgrade your plan to ${product.name} and the following amount ${addString}:`;

//   return { message };
// };

// const createStripeProductAndPrices = async ({
//   db,
//   org,
//   env,
//   product,
//   logger,
// }: {
//   db: DrizzleCli;
//   org: Organization;
//   env: AppEnv;
//   product: FullProduct;
//   logger: any;
// }) => {
//   if (!product.processor?.id) {
//     await checkStripeProductExists({
//       db,
//       org,
//       env,
//       product,
//       logger,
//     });
//   }

//   let batchPriceUpdates = [];
//   for (let price of product.prices) {
//     let stripeCli = createStripeCli({ org, env });
//     if (!price.config?.stripe_price_id) {
//       batchPriceUpdates.push(
//         createStripePriceIFNotExist({
//           db,
//           stripeCli,
//           price,
//           entitlements: product.entitlements,
//           product,
//           org,
//           logger,
//         }),
//       );
//     }
//   }

//   await Promise.all(batchPriceUpdates);
// };

// export const getUpgradePreview = async ({
//   db,
//   paymentMethod,
//   customer,
//   org,
//   env,
//   product,
//   curMainProduct,
//   features,
//   logger,
// }: {
//   paymentMethod: Stripe.PaymentMethod | null | undefined;
//   db: DrizzleCli;
//   customer: FullCustomer;
//   org: Organization;
//   env: AppEnv;
//   product: FullProduct;
//   curMainProduct: FullCusProduct;
//   features: Feature[];
//   logger: any;
// }) => {
//   // Create stripe product / prices if not exist
//   await createStripeProductAndPrices({
//     db,
//     org,
//     env,
//     product,
//     logger,
//   });

//   let stripeCli = createStripeCli({ org, env });
//   let stripeSubs = await getStripeSubs({
//     stripeCli,
//     subIds: curMainProduct.subscription_ids,
//   });

//   let attachParams = {
//     stripeCli,
//     paymentMethod,

//     org,
//     customer,
//     products: [product],
//     features,
//     prices: product.prices,
//     entitlements: product.entitlements,
//     freeTrial: product.free_trial || null,
//     cusProducts: customer.customer_products,
//     optionsList: [],
//     entities: [],
//   };

//   let updatePreview = (await handleStripeSubUpdate({
//     db,
//     stripeCli,
//     curCusProduct: curMainProduct,
//     attachParams,
//     stripeSubs,
//     logger: null,
//     carryExistingUsages: false,
//     shouldPreview: true,
//   })) as any;

//   let curPrices = cusProductToPrices({ cusProduct: curMainProduct });
//   let allPrices = [...product.prices, ...curPrices];

//   let nextCycleAt = stripeSubs[0].current_period_end * 1000;

//   // Fetch next cycle at from annual upgrades...
//   for (const item of updatePreview.lines.data) {
//     if (item.period.end * 1000 > nextCycleAt) {
//       nextCycleAt = item.period.end * 1000;
//     }
//   }

//   let baseLineItems = updatePreview.lines.data
//     .filter((item: any) => {
//       let price = allPrices.find((p) => {
//         let config = p.config;

//         return (
//           config.stripe_price_id === item.price.id ||
//           config.stripe_product_id == item.price.product
//         );
//       });

//       if (!price) {
//         return true;
//       }

//       let isPrepaid =
//         getBillingType(price?.config!) === BillingType.UsageInAdvance;

//       if (isPrepaid) {
//         return false; // Don't show prepaid items in preview
//       }

//       return true;
//     })
//     .map((item: any) => {
//       return {
//         amount: item.amount / 100,
//         description: item.description,
//       };
//     });

//   // let usageLineItems =
//   //   (await billForRemainingUsages({
//   //     db,
//   //     logger: console,
//   //     attachParams,
//   //     curCusProduct: curMainProduct,
//   //     newSubs: stripeSubs,
//   //     shouldPreview: true,
//   //   })) || [];

//   let totalAmount = baseLineItems.reduce(
//     (acc: number, item: any) => acc + item.amount,
//     0,
//   );

//   totalAmount += usageLineItems.reduce(
//     (acc: number, item: any) => acc + item.amount,
//     0,
//   );

//   let items = [...baseLineItems, ...usageLineItems].map((item) => {
//     return {
//       price: formatCurrency({
//         amount: item.amount,
//         defaultCurrency: org.default_currency,
//       }),
//       description: item.description,
//       usage_model: isFeaturePriceItem(item) ? item.usage_model : undefined,
//     };
//   });

//   let formattedMessage = formatMessage({
//     baseLineItems,
//     usageLineItems,
//     org,
//     product,
//   });

//   // Get options
//   let prodItems = mapToProductItems({
//     prices: product.prices,
//     entitlements: product.entitlements,
//     features,
//   });
//   let options = getOptions({
//     prodItems,
//     features,
//   });

//   let proratedAmount = totalAmount;
//   let regularAmount = prodItems
//     .filter((i) => isPriceItem(i))
//     .reduce((sum, i) => sum + i.price!, 0);

//   let dueToday, dueNextCycle;
//   if (org.config.bill_upgrade_immediately) {
//     dueToday = Number(proratedAmount.toFixed(2));
//     dueNextCycle = Number(regularAmount.toFixed(2));
//   } else {
//     dueToday = 0;
//     dueNextCycle = Number((proratedAmount + regularAmount).toFixed(2));
//   }

//   const result: CheckProductPreview = {
//     title: `Upgrade to ${product.name}`,
//     message: formattedMessage.message,

//     scenario: AttachScenario.Upgrade,
//     product_id: product.id,
//     product_name: product.name,
//     recurring: !isOneOff(product.prices),
//     next_cycle_at: nextCycleAt,
//     current_product_name: curMainProduct.product.name,

//     items,

//     options: options as any,
//     due_today: {
//       price: dueToday,
//       currency: org.default_currency || "USD",
//     },
//     due_next_cycle: {
//       price: dueNextCycle,
//       currency: org.default_currency || "USD",
//     },
//   };

//   return result;
// };
