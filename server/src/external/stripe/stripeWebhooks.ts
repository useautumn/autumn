import { OrgService } from "@/internal/orgs/OrgService.js";
import { Organization } from "@autumn/shared";
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

export const stripeWebhookRouter = express.Router();

stripeWebhookRouter.post(
  "/:orgId/:env",
  express.raw({ type: "application/json" }),
  async (request: any, response: any) => {
    const sig = request.headers["stripe-signature"];
    let event;

    const { orgId, env } = request.params;

    let org: Organization;
    try {
      org = await OrgService.getFullOrg({ sb: request.sb, orgId });
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

    const webhookSecret = getStripeWebhookSecret(org, env);
    try {
      event = stripe.webhooks.constructEvent(request.body, sig, webhookSecret);
    } catch (err: any) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log(
      `${chalk.gray(new Date().toISOString())} ${chalk.yellow(
        "Stripe Webhook: "
      )} ${request.url} ${request.url.includes("live") ? "   " : ""}| ${
        event?.type
      } | ID: ${event?.id}`
    );

    try {
      switch (event.type) {
        case "customer.subscription.created":
          await handleSubCreated({
            sb: request.sb,
            org,
            subscription: event.data.object,
            env,
          });
          break;

        case "customer.subscription.updated":
          const subscription = event.data.object;
          await handleSubscriptionUpdated({
            sb: request.sb,
            org,
            subscription,
            env,
          });
          break;

        case "customer.subscription.deleted":
          const deletedSubscription = event.data.object;
          await handleSubscriptionDeleted({
            sb: request.sb,
            subscription: deletedSubscription,
            org,
            env,
          });
          break;

        case "checkout.session.completed":
          const checkoutSession = event.data.object;
          await handleCheckoutSessionCompleted({
            sb: request.sb,
            checkoutSession,
            org,
            env,
          });
          break;

        // Triggered when payment through Stripe is successful
        case "invoice.paid":
          const invoice = event.data.object;
          await handleInvoicePaid({
            sb: request.sb,
            org,
            invoice,
            env,
            event,
            req: request,
          });
          break;

        case "invoice.created":
          const createdInvoice = event.data.object;
          await handleInvoiceCreated({
            sb: request.sb,
            org,
            invoice: createdInvoice,
            env,
            event,
          });
          break;

        case "invoice.finalized":
          const finalizedInvoice = event.data.object;
          await handleInvoiceFinalized({
            sb: request.sb,
            org,
            invoice: finalizedInvoice,
            env,
            event,
          });
          break;
        case "subscription_schedule.canceled":
          const canceledSchedule = event.data.object;
          await handleSubscriptionScheduleCanceled({
            sb: request.sb,
            org,
            env,
            schedule: canceledSchedule,
          });
          break;
      }
    } catch (error) {
      handleRequestError({
        req: request,
        error,
        res: response,
        action: "stripe webhook",
      });
      // if (error instanceof RecaseError) {
      //   error.print();
      //   response
      //     .status(500)
      //     .send(`Error handling stripe webhook event: ${error}`);
      //   return;
      // }
      // console.log("Unhandled error in stripe webhook event: ", error);
      // response
      //   .status(500)
      //   .send(`Unhandled error in stripe webhook event: ${error}`);
      // return;
    }

    response.send();
  }
);

// if (
//   event.type == "invoice.created" ||
//   event.type == "invoice.paid" ||
//   event.type == "invoice.finalized"
// ) {
//   // 1. created
//   let invoice: Stripe.Invoice = event.data.object;
//   console.log(
//     "Invoice created: ",
//     format(new Date(invoice.created * 1000), "MMM dd hh:mm:ss a")
//   );
//   console.log("Status: ", invoice.status);

//   let transitions = invoice.status_transitions;

//   if (transitions.finalized_at) {
//     console.log(
//       "Finalized at:  ",
//       format(new Date(transitions.finalized_at * 1000), "MMM dd hh:mm:ss a")
//     );
//   } else {
//     console.log("Finalized at: not set");
//   }

//   if (transitions.paid_at) {
//     console.log(
//       "Paid at: ",
//       format(new Date(transitions.paid_at * 1000), "MMM dd hh:mm:ss a")
//     );
//   } else {
//     console.log("Paid at: not set");
//   }

//   // console.log("Invoice: ", event.data.object);
// }
