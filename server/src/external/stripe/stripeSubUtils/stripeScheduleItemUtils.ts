// export const findPriceInScheduleItems = ({
//   prices,
//   subItem,
//   billingType,
// }: {
//   prices: Price[];
//   subItem: Stripe.SubscriptionItem | Stripe.InvoiceLineItem;
//   billingType?: BillingType;
// }) => {
//   return prices.find((p: Price) => {
//     let config = p.config;
//     let itemMatch =
//       config.stripe_price_id == subItem.price?.id ||
//       config.stripe_product_id == subItem.price?.product;

//     const priceBillingType = getBillingType(config);
//     let billingTypeMatch = billingType ? priceBillingType == billingType : true;

//     return itemMatch && billingTypeMatch;
//   });
// };

// export const findScheduleItemForPrice = ({
//   price,
//   items,
// }: {
//   price: Price;
//   items: Stripe.SubscriptionSchedule.Phase.Item[];
// }) => {
//   return items.find((si) => {
//     const config = price.config as UsagePriceConfig;
//     return config.stripe_price_id == si.price?.id;
//   });
// };
