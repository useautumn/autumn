import express, { Router } from "express";
import stripe, { Stripe } from "stripe";
import chalk from "chalk";

import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv, AuthType, LoggerAction, Organization } from "@autumn/shared";

import { handleCheckoutSessionCompleted } from "./webhookHandlers/handleCheckoutCompleted.js";
import { handleSubscriptionUpdated } from "./webhookHandlers/handleSubUpdated.js";
import { handleSubDeleted } from "./webhookHandlers/handleSubDeleted.js";
import { handleSubCreated } from "./webhookHandlers/handleSubCreated.js";
import { getStripeWebhookSecret } from "@/internal/orgs/orgUtils.js";
import { handleInvoicePaid } from "./webhookHandlers/handleInvoicePaid.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { handleInvoiceCreated } from "./webhookHandlers/handleInvoiceCreated/handleInvoiceCreated.js";
import { handleInvoiceFinalized } from "./webhookHandlers/handleInvoiceFinalized.js";
import { handleSubscriptionScheduleCanceled } from "./webhookHandlers/handleSubScheduleCanceled.js";
import { handleCusDiscountDeleted } from "./webhookHandlers/handleCusDiscountDeleted.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { createStripeCli } from "./utils.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { CusService } from "@/internal/customers/CusService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const stripeWebhookRouter: Router = express.Router();

const logStripeWebhook = ({
  req,
  event,
}: {
  req: ExtendedRequest;
  event: Stripe.Event;
}) => {
  req.logtail.info(
    `${chalk.yellow("STRIPE").padEnd(18)} ${event.type.padEnd(30)} ${req.org.slug} | ${event.id}`
  );
};

stripeWebhookRouter.post(
  "/:orgId/:env",
  express.raw({ type: "application/json" }),
  async (request: any, response: any) => {
    const sig = request.headers["stripe-signature"];
    let event;

    const { orgId, env } = request.params;
    const { db } = request;

    let org: Organization;

    const data = await OrgService.getWithFeatures({
      db: request.db,
      orgId,
      env,
      allowNotFound: true,
    });

    if (!data) {
      response.status(200).send(`Org ${orgId} not found`);
      return;
    }

    request.org = data.org;
    request.features = data.features;
    request.env = env;
    org = data.org;

    if (!org.stripe_config) {
      console.log(`Org ${orgId} does not have a stripe config`);
      response.status(200).send(`Org ${orgId} does not have a stripe config`);
      return;
    }

    try {
      const webhookSecret = getStripeWebhookSecret(org, env);

      event = await stripe.webhooks.constructEventAsync(
        request.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // event = JSON.parse(request.body);

    try {
      request.body = JSON.parse(request.body);
      request.authType = AuthType.Stripe;
    } catch (error) {
      console.log("Error parsing body", error);
    }

    // event = request.body;

    request.logtail = request.logtail.child({
      context: {
        context: {
          // body: request.body,
          event_type: event.type,
          event_id: event.id,
          // @ts-ignore
          object_id: `${event.data?.object?.id}` || "N/A",
          authType: AuthType.Stripe,
          org_id: orgId,
          org_slug: org.slug,
          env,
        },
      },
    });

    let logger = request.logtail;
    logStripeWebhook({ req: request, event });

    // const logger = createLogtailWithContext({
    //   action: LoggerAction.StripeWebhook,
    //   event_type: event.type,
    //   data: event.data,
    //   org_id: orgId,
    //   org_slug: org.slug,
    //   env,
    // });

    try {
      const stripeCli = createStripeCli({ org, env });
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
            req: request,
            db,
            org,
            subscription,
            previousAttributes: event.data.previous_attributes,
            env,
            logger,
          });
          break;

        case "customer.subscription.deleted":
          await handleSubDeleted({
            req: request,
            stripeCli,
            data: event.data.object,
            logger,
          });
          break;

        case "checkout.session.completed":
          const checkoutSession = event.data.object;
          await handleCheckoutSessionCompleted({
            req: request,
            db,
            data: checkoutSession,
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
            logger,
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
          break;
      }
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        if (error.message.includes("No such customer")) {
          logger.warn(`stripe customer missing: ${error.message}`);
          response.status(200).json({ message: "ok" });
          return;
        }
      }

      handleRequestError({
        req: request,
        error,
        res: response,
        action: "stripe webhook",
      });
      return;
    }

    try {
      await handleStripeWebhookRefresh({
        eventType: event.type,
        data: event.data,
        db,
        org,
        env,
        logger,
      });
    } catch (error) {
      logger.error(`Stripe webhook, error refreshing cache!`, { error });
    }

    // DO NOT DELETE -- RESPONSIBLE FOR SENDING SUCCESSFUL RESPONSE TO STRIPE...
    response.status(200).send();
  }
);

const coreEvents = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.created",
  "invoice.finalized",
  "subscription_schedule.canceled",
  "checkout.session.completed",
];

export const handleStripeWebhookRefresh = async ({
  eventType,
  data,
  db,
  org,
  env,
  logger,
}: {
  eventType: string;
  data: any;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  if (coreEvents.includes(eventType)) {
    let stripeCusId = data.object.customer;
    if (!stripeCusId) {
      logger.warn(
        `stripe webhook cache refresh, object doesn't contain customer id`,
        {
          data: {
            eventType,
            object: data.object,
          },
        }
      );
      return;
    }

    let cus = await CusService.getByStripeId({
      db,
      stripeId: stripeCusId,
    });

    if (!cus) {
      logger.warn(
        `Searched for customer by stripe id, but not found: ${stripeCusId}`
      );
      return;
    }

    // logger.info(`Deleting cache for customer ${cus.id}`);
    await deleteCusCache({
      db,
      customerId: cus.id!,
      org,
      env,
    });
  }
};
