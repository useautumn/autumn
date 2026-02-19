import { type AttachConfig, ErrCode } from "@autumn/shared";
import type { Logger } from "@server/external/logtail/logtailUtils";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import {
	getEarliestPeriodEnd,
	getLatestPeriodStart,
} from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { sanitizeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { buildInvoiceMemoFromEntitlements } from "@/internal/invoices/invoiceMemoUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import type { ItemSet } from "@/utils/models/ItemSet.js";

export const createStripeSub2 = async ({
	db,
	stripeCli,
	attachParams,
	config,
	billingCycleAnchorUnix,
	itemSet,
	logger,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	attachParams: AttachParams;
	config: AttachConfig;
	billingCycleAnchorUnix?: number;
	itemSet: ItemSet;
	logger: Logger;
}) => {
	const { customer, invoiceOnly, freeTrial, org, now, rewards, metadata } =
		attachParams;

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: customer.processor.id,
		errorIfNone: config.requirePaymentMethod,
	});

	let paymentMethodData = {};
	if (paymentMethod) {
		paymentMethodData = {
			default_payment_method: paymentMethod.id,
		};
		// if (paymentMethod.type === "alipay") {

		// } else {

		// }
	}

	const { subItems, invoiceItems, usageFeatures } = itemSet;

	const discounts = rewards
		? rewards.map((reward) => ({ coupon: reward.id }))
		: undefined;

	// Check if using custom payment method (Vercel, etc.)
	const isCustomPaymentMethod = paymentMethod?.type === "custom";

	try {
		const subscription = await stripeCli.subscriptions.create({
			...paymentMethodData,
			customer: customer.processor.id,
			items: sanitizeSubItems(subItems),

			billing_mode: { type: "flexible" },
			// For custom payment methods (e.g., Vercel), start subscription as incomplete
			// The subscription will become active after external payment is confirmed via Payment Records API
			payment_behavior: isCustomPaymentMethod
				? "default_incomplete"
				: "default_incomplete",
			// payment_behavior: "default_incomplete",

			add_invoice_items: invoiceItems,
			collection_method: invoiceOnly ? "send_invoice" : "charge_automatically",
			days_until_due: invoiceOnly ? 30 : undefined,
			billing_cycle_anchor: billingCycleAnchorUnix
				? Math.floor(billingCycleAnchorUnix / 1000)
				: undefined,

			discounts,
			expand: ["latest_invoice"],

			// Pass metadata from attachParams (e.g., Vercel installation/billing plan IDs)
			metadata: metadata || undefined,

			// For custom payment methods, save the payment method on the subscription
			// so it's available in webhook handlers and for future renewals
			...(isCustomPaymentMethod && {
				payment_settings: {
					save_default_payment_method: "on_subscription",
				},
			}),

			...{
				trial_settings:
					freeTrial && !freeTrial.card_required
						? {
								end_behavior: {
									missing_payment_method: "cancel",
								},
							}
						: undefined,

				trial_end: freeTrialToStripeTimestamp({ freeTrial, now }),
			},
		});

		const latestInvoice = subscription.latest_invoice as Stripe.Invoice;

		if (
			invoiceOnly &&
			org.config.invoice_memos &&
			latestInvoice &&
			latestInvoice.status === "draft"
		) {
			try {
				const desc = await buildInvoiceMemoFromEntitlements({
					org,
					entitlements: attachParams.entitlements,
					features: attachParams.features,
					prices: attachParams.prices,
					logger,
				});
				await stripeCli.invoices.update(latestInvoice.id!, {
					description: desc,
				});
			} catch (error) {
				logger.error("CREATE STRIPE SUB: error adding invoice memo", { error });
			}
		}

		if (
			invoiceOnly &&
			config.invoiceCheckout &&
			config.finalizeInvoice &&
			latestInvoice &&
			latestInvoice.status === "draft"
		) {
			subscription.latest_invoice = await stripeCli.invoices.finalizeInvoice(
				(subscription.latest_invoice as Stripe.Invoice).id!,
			);
		}

		// Store
		const earliestPeriodEnd = getEarliestPeriodEnd({ sub: subscription });
		const currentPeriodStart = getLatestPeriodStart({ sub: subscription });

		await SubService.createSub({
			db,
			sub: {
				id: generateId("sub"),
				stripe_id: subscription.id,
				stripe_schedule_id: subscription.schedule as string,
				created_at: subscription.created * 1000,
				usage_features: usageFeatures,
				org_id: org.id,
				env: customer.env,
				current_period_start: currentPeriodStart,
				current_period_end: earliestPeriodEnd,
			},
		});

		return subscription;
	} catch (error: any) {
		console.log("Warning: Failed to create stripe subscription");
		console.log("Error code:", error.code);
		console.log("Message:", error.message);
		console.log("Decline code:", error.decline_code);
		console.log("Error original stack:", error.stack);

		throw new RecaseError({
			code: ErrCode.CreateStripeSubscriptionFailed,
			message: `Create stripe subscription failed ${
				error.code ? `(${error.code})` : ""
			}: ${error.message || ""}`,
			statusCode: 500,
		});
	}
};
