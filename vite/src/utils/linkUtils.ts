import { AppEnv } from "@autumn/shared";

export const getStripeCusLink = (customerId: string, env: AppEnv) => {
  return `https://dashboard.stripe.com${
    env == AppEnv.Live ? "" : "/test"
  }/customers/${customerId}`;
};

export const getStripeSubLink = (subscriptionId: string, env: AppEnv) => {
  return `https://dashboard.stripe.com${
    env == AppEnv.Live ? "" : "/test"
  }/subscriptions/${subscriptionId}`;
};

export const getStripeInvoiceLink = (stripeInvoice: any) => {
  return `https://dashboard.stripe.com${
    stripeInvoice.livemode ? "" : "/test"
  }/invoices/${stripeInvoice.id}`;
};
