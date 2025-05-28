import { OrgService } from "@/internal/orgs/OrgService.js";
import { LoggerAction, Organization } from "@autumn/shared";
import express from "express";
import stripe from "stripe";
import { handleCheckoutSessionCompleted } from "./webhookHandlers/handleCheckoutCompleted.js";
import { handleSubscriptionUpdated } from "./webhookHandlers/handleSubUpdated.js";
import { handleSubscriptionDeleted } from "./webhookHandlers/handleSubDeleted.js";
import { handleSubCreated } from "./webhookHandlers/handleSubCreated.js";
import { getStripeWebhookSecret } from "@/internal/orgs/orgUtils.js";
import { handleInvoicePaid } from "./webhookHandlers/handleInvoicePaid.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { handleInvoiceCreated } from "./webhookHandlers/handleInvoiceCreated.js";
import chalk from "chalk";
import { handleInvoiceFinalized } from "./webhookHandlers/handleInvoiceFinalized.js";
import { handleSubscriptionScheduleCanceled } from "./webhookHandlers/handleSubScheduleCanceled.js";
import { format } from "date-fns";
import { createLogtailWithContext } from "../logtail/logtailUtils.js";
import { handleCusDiscountDeleted } from "./webhookHandlers/handleCusDiscountDeleted.js";

export const stripeWebhookRouter = express.Router();

stripeWebhookRouter.post(
  "/:orgId/:env",
  express.raw({ type: "application/json" }),
  async (request: any, response: any) => {
    const sig = request.headers["stripe-signature"];
    let event;

    const { orgId, env } = request.params;
    const { db } = request;

    let org: Organization;
    try {
      org = await OrgService.get({ db: request.db, orgId });
    } catch (error) {
      console.log(`Org ${orgId} not found`);
      response.status(200).send(`Org ${orgId} not found`);
      return;
    }

    if (!org.stripe_config) {
      console.log(`Org ${orgId} does not have a stripe config`);
      response.status(200).send(`Org ${orgId} does not have a stripe config`);
      return;
    }

    // const webhookSecret = getStripeWebhookSecret(org, env);
    // try {
    //   event = stripe.webhooks.constructEvent(request.body, sig, webhookSecret);
    // } catch (err: any) {
    //   response.status(400).send(`Webhook Error: ${err.message}`);
    //   return;
    // }
    event = JSON.parse(request.body);

    const logger = createLogtailWithContext({
      action: LoggerAction.StripeWebhook,
      event_type: event.type,
      data: event.data,
      org_id: orgId,
      org_slug: org.slug,
      env,
    });

    console.log(
      `${chalk.gray(format(new Date(), "dd MMM HH:mm:ss"))} ${chalk.yellow(
        "Stripe Webhook: ",
      )} ${request.url} ${request.url.includes("live") ? "   " : ""}| ${
        event?.type
      } | ID: ${event?.id}`,
    );

    try {
      switch (event.type) {
        case "customer.subscription.created":
          await handleSubCreated({
            db,
            org,
            subData: event.data.object,
            env,
            logger,
          });
          break;

        case "customer.subscription.updated":
          const subscription = event.data.object;
          await handleSubscriptionUpdated({
            db,
            org,
            subscription,
            previousAttributes: event.data.previous_attributes,
            env,
            logger,
          });
          break;

        case "customer.subscription.deleted":
          const deletedSubscription = event.data.object;
          await handleSubscriptionDeleted({
            db,
            subscription: deletedSubscription,
            org,
            env,
            logger,
          });
          break;

        case "checkout.session.completed":
          const checkoutSession = event.data.object;
          await handleCheckoutSessionCompleted({
            db,
            checkoutSession,
            org,
            env,
            logger,
          });
          break;

        // Triggered when payment through Stripe is successful
        case "invoice.paid":
          const invoice = event.data.object;
          await handleInvoicePaid({
            db,
            org,
            invoiceData: invoice,
            env,
            event,
            req: request,
          });
          break;

        case "invoice.created":
          const createdInvoice = event.data.object;
          await handleInvoiceCreated({
            db,
            org,
            data: createdInvoice,
            env,
          });
          break;

        case "invoice.finalized":
          const finalizedInvoice = event.data.object;
          await handleInvoiceFinalized({
            db,
            org,
            data: finalizedInvoice,
            env,
            logger,
          });
          break;
        case "subscription_schedule.canceled":
          const canceledSchedule = event.data.object;
          await handleSubscriptionScheduleCanceled({
            db,
            org,
            env,
            schedule: canceledSchedule,
            logger,
          });
          break;

        case "customer.discount.deleted":
          await handleCusDiscountDeleted({
            db,
            org,
            discount: event.data.object,
            env,
            logger,
            res: response,
          });
          return;
          break;
      }
    } catch (error) {
      handleRequestError({
        req: request,
        error,
        res: response,
        action: "stripe webhook",
      });
      return;
    }

    // DO NOT DELETE -- RESPONSIBLE FOR SENDING SUCCESSFUL RESPONSE TO STRIPE...
    response.status(200).send();
  },
);
