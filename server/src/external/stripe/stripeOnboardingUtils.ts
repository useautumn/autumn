import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";

export const checkKeyValid = async (apiKey: string) => {
  const stripe = new Stripe(apiKey);
  const account = await stripe.accounts.retrieve();
  // console.log("Account", account);
  return account;
};

export const createWebhookEndpoint = async (
  apiKey: string,
  env: AppEnv,
  orgId: string
) => {
  const stripe = new Stripe(apiKey);

  const endpoint = await stripe.webhookEndpoints.create({
    url: `${process.env.SERVER_URL}/webhooks/stripe/${orgId}/${env}`,
    enabled_events: [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "checkout.session.completed",
      "invoice.paid",
    ],
  });

  return endpoint;
};
