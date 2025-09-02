import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode } from "@autumn/shared";
import Stripe from "stripe";

export const checkKeyValid = async (apiKey: string) => {
  const stripe = new Stripe(apiKey);

  // Call customers.list
  const customers = await stripe.customers.list();

  // const account = await stripe.accounts.retrieve();
  // console.log("Account", account);
  // return account;
};

export const createWebhookEndpoint = async (
  apiKey: string,
  env: AppEnv,
  orgId: string
) => {
  const stripe = new Stripe(apiKey);

  const webhookBaseUrl =
    process.env.SERVER_URL || process.env.STRIPE_WEBHOOK_URL;

  if (!webhookBaseUrl) {
    throw new RecaseError({
      message: "Stripe webhook baseURL not found",
      code: ErrCode.StripeKeyInvalid,
      statusCode: 500,
    });
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url: `${webhookBaseUrl}/webhooks/stripe/${orgId}/${env}`,
    enabled_events: [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "checkout.session.completed",
      "invoice.paid",
      "invoice.upcoming",
      "invoice.created",
      "invoice.finalized",
      "invoice.updated",
      "subscription_schedule.canceled",
      "subscription_schedule.updated",
      "customer.discount.deleted",
    ],
  });

  return endpoint;
};
