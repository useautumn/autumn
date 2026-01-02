import type { Organization } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import chalk from "chalk";
import { Stripe } from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { unsetOrgStripeKeys } from "@/internal/orgs/orgUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AutumnContext } from "../../honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../../internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import type { Logger } from "../logtail/logtailUtils.js";
import { getSentryTags } from "../sentry/sentryUtils.js";
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

const updateProductEvents = ["customer.subscription.updated"];

const coreEvents = [
	"customer.subscription.deleted",
	"subscription_schedule.canceled",
	"checkout.session.completed",
];

const updateInvoiceEvents = [
	"invoice.paid",
	"invoice.updated",
	"invoice.created",
	"invoice.finalized",
];

const handleStripeWebhookRefresh = async ({
	eventType,
	data,
	ctx,
}: {
	eventType: string;
	data: any;
	ctx: AutumnContext;
}) => {
	const { db, logger, org, env } = ctx;

	if (
		coreEvents.includes(eventType) ||
		updateProductEvents.includes(eventType) ||
		updateInvoiceEvents.includes(eventType)
	) {
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
			orgId: org.id,
			env,
		});

		if (!cus) {
			logger.warn(
				`Searched for customer by stripe id, but not found: ${stripeCusId}`,
			);
			return;
		}

		const orgMatch = cus?.org_id === org.id && cus?.env === env;
		if (!orgMatch) {
			logger.warn(
				`Customer org or env mismatch, skipping cache refresh: ${cus?.org_id} !== ${org.id} || ${cus?.env} !== ${env}`,
			);
			return;
		}

		logger.info(`Attempting delete cached api customer! ${eventType}`);
		await deleteCachedApiCustomer({
			customerId: cus.id!,
			orgId: org.id,
			env,
			source: `handleStripeWebhookRefresh: ${eventType}`,
		});

		// let fullCus: FullCustomer | undefined;
		// if (
		// 	updateProductEvents.includes(eventType) ||
		// 	updateInvoiceEvents.includes(eventType)
		// ) {
		// 	fullCus = await CusService.getFull({
		// 		db,
		// 		idOrInternalId: cus.id!,
		// 		orgId: org.id,
		// 		env,
		// 		withEntities: true,
		// 		withSubs: true,
		// 		expand: [CusExpand.Invoices],
		// 	});

		// 	if (updateProductEvents.includes(eventType)) {
		// 		await setCachedApiSubs({
		// 			ctx,
		// 			fullCus,
		// 			customerId: cus.id!,
		// 		});
		// 	}

		// 	if (updateInvoiceEvents.includes(eventType)) {
		// 		await setCachedApiInvoices({
		// 			ctx,
		// 			fullCus,
		// 			customerId: cus.id!,
		// 		});
		// 	}
		// } else {
		// 	logger.info(`Attempting delete cached api customer! ${eventType}`);
		// 	await deleteCachedApiCustomer({
		// 		customerId: cus.id!,
		// 		orgId: org.id,
		// 		env,
		// 		source: `handleStripeWebhookRefresh: ${eventType}`,
		// 	});
		// }
	}
};

/**
 * Handles Stripe webhook events after org/env extraction
 */
export const handleStripeWebhookEvent = async ({
	ctx,
	event,
}: {
	ctx: AutumnContext;
	event: Stripe.Event;
}) => {
	const { db, logger, org, env } = ctx;
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
					ctx,
					subscription,
					previousAttributes: event.data.previous_attributes,
				});
				break;
			}

			case "customer.subscription.deleted":
				await handleSubDeleted({
					ctx,
					stripeCli,
					data: event.data.object,
				});
				break;

			case "checkout.session.completed": {
				const checkoutSession = event.data.object;
				await handleCheckoutSessionCompleted({
					ctx,
					db,
					data: checkoutSession,
					org,
					env,
				});
				break;
			}

			case "invoice.paid": {
				const invoice = event.data.object;
				await handleInvoicePaid({
					ctx,
					invoiceData: invoice,
					event,
				});
				break;
			}

			case "invoice.updated":
				await handleInvoiceUpdated({
					event,
					req: ctx as unknown as ExtendedRequest,
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

			// case "invoice.payment_attempt_required": {
			// 	const invoice = event.data.object;
			// 	await handleInvoicePaymentAttemptRequired({
			// 		db,
			// 		org,
			// 		invoice,
			// 		env,
			// 		logger,
			// 	});
			// 	break;
			// }

			case "subscription_schedule.canceled": {
				const canceledSchedule = event.data.object;
				await handleSubscriptionScheduleCanceled({
					db,
					org,
					env,
					schedule: canceledSchedule,
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
				});
				break;
		}
	} catch (error) {
		Sentry.captureException(error, {
			tags: getSentryTags({
				ctx,
				method: event.type,
			}),
		});

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

		if (
			process.env.NODE_ENV === "development" &&
			error instanceof Error &&
			error.message.includes("No stripe account linked to organization")
		) {
			return;
		}

		logger.error(`Stripe webhook, error: ${error}`, { error });
		throw error;
	}

	try {
		await handleStripeWebhookRefresh({
			eventType: event.type,
			data: event.data,
			ctx,
		});
	} catch (error) {
		logger.error(`Stripe webhook, error refreshing cache: ${error}`, {
			error: {
				message: error instanceof Error ? error.message : String(error),
			},
		});
		return { success: true };
	}

	return { success: true };
};
