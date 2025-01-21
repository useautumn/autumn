// import Stripe from "stripe";
// import { createStripeCli } from "@/external/stripe/utils.js";
// import { AppEnv, Entitlement, Price } from "@autumn/shared";
// import { Organization } from "@autumn/shared";
// import { FullProduct } from "@autumn/shared";
// import { Customer } from "@autumn/shared";
// import {
//   pricesContainRecurring,
//   pricesOnlyRequireSetup,
// } from "@/internal/prices/priceUtils.js";
// import { priceToStripeItem } from "@/external/stripe/stripePriceUtils.js";
// import { PriceOptions } from "@autumn/shared";
// import { PricesInput } from "@autumn/shared";

// export const createStripeCheckout = async ({
//   customer,
//   product,
//   org,
//   env,
//   prices,
//   entitlements,
//   pricesInput,
// }: {
//   customer: Customer;
//   product: FullProduct;
//   org: Organization;
//   env: AppEnv;
//   prices: Price[];
//   entitlements: Entitlement[];
//   pricesInput: PricesInput;
// }) => {
//   console.log("Env", env);
//   const stripeCli = createStripeCli({ org, env });
//   let isRecurring = pricesContainRecurring(product.prices);
//   let isSetup = pricesOnlyRequireSetup(product.prices);

//   const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

//   for (const price of prices) {
//     if (isSetup) {
//       continue;
//     }

//     const options: PriceOptions | undefined = pricesInput.find(
//       (po) => po.id == price.id
//     )?.options;

//     try {
//       const stripeLineItem = priceToStripeItem({
//         product,
//         price,
//         org,
//         options,
//       });
//       if (stripeLineItem) {
//         stripeLineItems.push(stripeLineItem as any);
//       }
//     } catch (error) {
//       throw error;
//     }
//   }

//   // Create pricesInput

//   // 1. Get price data for each price

//   return await stripeCli.checkout.sessions.create({
//     customer: customer.processor.id,
//     line_items: isSetup ? undefined : stripeLineItems,
//     mode: isSetup ? "setup" : isRecurring ? "subscription" : "payment",
//     currency: org.default_currency,
//     success_url: "https://test.com",

//     // success_url: "https://example.com/success",
//     metadata: {
//       org_id: org.id,
//       customer_id: customer.id,
//       product_id: product.id,
//       prices_input: JSON.stringify(pricesInput),
//       price_ids: JSON.stringify(prices.map((p: Price) => p.id)),
//       entitlement_ids: JSON.stringify(
//         entitlements.map((e: Entitlement) => e.id)
//       ),
//       env: env,
//     },
//   });
// };
