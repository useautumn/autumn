import type { AppEnv, Organization } from "@autumn/shared";
import chalk from "chalk";
import { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { unsetOrgStripeKeys } from "@/internal/orgs/orgUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { Logger } from "../logtail/logtailUtils.js";
import { handleCheckoutSessionCompleted } from "./webhookHandlers/handleCheckoutCompleted.js";
import { handleCusDiscountDeleted } from "./webhookHandlers/handleCusDiscountDeleted.js";
import { handleInvoiceCreated } from "./webhookHandlers/handleInvoiceCreated/handleInvoiceCreated.js";
import { handleInvoiceFinalized } from "./webhookHandlers/handleInvoiceFinalized.js";
import { handleInvoicePaid } from "./webhookHandlers/handleInvoicePaid.js";
import { handleInvoiceUpdated } from "./webhookHandlers/handleInvoiceUpdated.js";
import { handleSubCreated } from "./webhookHandlers/handleSubCreated.js";
import { handleSubDeleted } from "./webhookHandlers/handleSubDeleted.js";
import { handleSubscriptionScheduleCanceled } from "./webhookHandlers/handleSubScheduleCanceled.js";
import { handleSubscriptionUpdated } from "./webhookHandlers/handleSubUpdated.js";

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

const handleStripeWebhookRefresh = async ({
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

		await deleteCusCache({
			db,
			customerId: cus.id!,
			org,
			env,
		});
	}
};

/**
 * Handles Stripe webhook events after org/env extraction
 */
export const handleStripeWebhookEvent = async ({
	event,
	db,
	org,
	env,
	logger,
	req,
}: {
	event: Stripe.Event;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	logger: Logger;
	req: ExtendedRequest;
}) => {
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
					req,
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
					req,
					stripeCli,
					data: event.data.object,
					logger,
				});
				break;

			case "checkout.session.completed": {
				const checkoutSession = event.data.object;
				await handleCheckoutSessionCompleted({
					req,
					db,
					data: checkoutSession,
					org,
					env,
					logger,
				});
				break;
			}

			case "invoice.paid": {
				const invoice = event.data.object;
				await handleInvoicePaid({
					db,
					org,
					invoiceData: invoice,
					env,
					event,
					req,
				});
				break;
			}

			case "invoice.updated":
				await handleInvoiceUpdated({
					stripeCli,
					env,
					event,
					req,
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
					res: req,
				});
				break;
		}
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError) {
			if (error.message.includes("No such customer")) {
				logger.warn(`stripe customer missing: ${error.message}`);
				return { success: true };
			}

			if (error.message.includes("Expired API Key provided")) {
				await unsetOrgStripeKeys({
					db,
					org,
					env,
				});

				return { success: true };
			}
		}

		logger.error(`Stripe webhook, error: ${error}`, { error });
		throw error;
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
		return { success: true };
	}

	return { success: true };
};
