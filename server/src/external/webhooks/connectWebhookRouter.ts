import { type AppEnv, AuthType, type Organization } from "@autumn/shared";
import chalk from "chalk";
import express, { type Router } from "express";
import type { Context } from "hono";
import { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initMasterStripe } from "@/external/connect/initMasterStripe.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { unsetOrgStripeKeys } from "@/internal/orgs/orgUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { Logger } from "../logtail/logtailUtils.js";
import { handleCheckoutSessionCompleted } from "../stripe/webhookHandlers/handleCheckoutCompleted.js";
import { handleCusDiscountDeleted } from "../stripe/webhookHandlers/handleCusDiscountDeleted.js";
import { handleInvoiceCreated } from "../stripe/webhookHandlers/handleInvoiceCreated/handleInvoiceCreated.js";
import { handleInvoiceFinalized } from "../stripe/webhookHandlers/handleInvoiceFinalized.js";
import { handleInvoicePaid } from "../stripe/webhookHandlers/handleInvoicePaid.js";
import { handleInvoiceUpdated } from "../stripe/webhookHandlers/handleInvoiceUpdated.js";
import { handleSubCreated } from "../stripe/webhookHandlers/handleSubCreated.js";
import { handleSubDeleted } from "../stripe/webhookHandlers/handleSubDeleted.js";
import { handleSubscriptionScheduleCanceled } from "../stripe/webhookHandlers/handleSubScheduleCanceled.js";
import { handleSubscriptionUpdated } from "../stripe/webhookHandlers/handleSubUpdated.js";

export const connectWebhookRouter: Router = express.Router();

const logStripeWebhook = ({
	logger,
	org,
	event,
}: {
	logger: Logger;
	org: Organization;
	event: Stripe.Event;
}) => {
	logger.info(
		`${chalk.yellow("STRIPE").padEnd(18)} ${event.type.padEnd(30)} ${org.slug} | ${event.id}`,
	);
};

export const handleConnectWebhook = async (c: Context<HonoEnv>) => {
	const ctx = c.get("ctx");

	const { db, logger } = ctx;

	const masterStripe = initMasterStripe();
	let event: Stripe.Event;
	try {
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
		const rawBody = await c.req.text();
		const signature = c.req.header("stripe-signature") || "";

		event = await masterStripe.webhooks.constructEventAsync(
			rawBody,
			signature,
			webhookSecret,
		);
	} catch (err: any) {
		logger.error(`Webhook verification error: ${err.message}`, { error: err });
		return c.json({ error: err.message }, 400);
	}

	const accountId = event.account;

	if (!accountId) {
		return c.json({ error: "Account ID not found" }, 400);
	}

	const { org, features, env } = await OrgService.getByAccountId({
		db,
		accountId,
	});

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.logger = ctx.logger.child({
		context: {
			context: {
				event_type: event.type,
				event_id: event.id,
				// @ts-expect-error
				object_id: `${event.data?.object?.id}` || "N/A",
				authType: AuthType.Stripe,
				org_id: org.id,
				org_slug: org.slug,
				env,
			},
		},
	});

	logStripeWebhook({ logger, org, event });

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

			case "customer.subscription.updated": {
				const subscription = event.data.object;
				await handleSubscriptionUpdated({
					req: ctx as ExtendedRequest,
					db,
					org,
					subscription,
					previousAttributes: event.data.previous_attributes,
					env,
					logger,
				});
				break;
			}

			case "customer.subscription.deleted":
				await handleSubDeleted({
					req: ctx as ExtendedRequest,
					stripeCli,
					data: event.data.object,
					logger,
				});
				break;

			case "checkout.session.completed": {
				const checkoutSession = event.data.object;
				await handleCheckoutSessionCompleted({
					req: ctx as ExtendedRequest,
					db,
					data: checkoutSession,
					org,
					env,
					logger,
				});
				break;
			}

			// Triggered when payment through Stripe is successful
			case "invoice.paid": {
				const invoice = event.data.object;
				await handleInvoicePaid({
					db,
					org,
					invoiceData: invoice,
					env,
					event,
					req: ctx as ExtendedRequest,
				});
				break;
			}

			case "invoice.updated":
				await handleInvoiceUpdated({
					stripeCli,
					env,
					event,
					req: ctx as ExtendedRequest,
				});
				break;

			case "invoice.created": {
				const createdInvoice = event.data.object;
				await handleInvoiceCreated({
					db,
					org,
					data: createdInvoice,
					env,
					logger,
				});
				break;
			}

			case "invoice.finalized": {
				const finalizedInvoice = event.data.object;
				await handleInvoiceFinalized({
					db,
					org,
					data: finalizedInvoice,
					env,
					logger,
				});
				break;
			}

			case "subscription_schedule.canceled": {
				const canceledSchedule = event.data.object;
				await handleSubscriptionScheduleCanceled({
					db,
					org,
					env,
					schedule: canceledSchedule,
					logger,
				});
				break;
			}

			case "customer.discount.deleted":
				await handleCusDiscountDeleted({
					db,
					org,
					discount: event.data.object,
					env,
					logger,
					res: ctx as ExtendedRequest,
				});
				break;
		}
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError) {
			if (error.message.includes("No such customer")) {
				logger.warn(`stripe customer missing: ${error.message}`);
				return c.json({ message: "ok" }, 200);
			}

			if (error.message.includes("Expired API Key provided")) {
				// Disconnect Stripe
				await unsetOrgStripeKeys({
					db,
					org,
					env,
				});

				return c.json({ message: "ok" }, 200);
			}
		}

		logger.error(`Stripe webhook, error: ${error}`, { error });
		return c.json({ message: "Internal server error" }, 500);
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

	return c.json({ message: "Webhook received" }, 200);
};

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
		const stripeCusId = data.object.customer;
		if (!stripeCusId) {
			logger.warn(
				`stripe webhook cache refresh, object doesn't contain customer id`,
				{
					data: {
						eventType,
						object: data.object,
					},
				},
			);
			return;
		}

		const cus = await CusService.getByStripeId({
			db,
			stripeId: stripeCusId,
		});

		if (!cus) {
			logger.warn(
				`Searched for customer by stripe id, but not found: ${stripeCusId}`,
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
