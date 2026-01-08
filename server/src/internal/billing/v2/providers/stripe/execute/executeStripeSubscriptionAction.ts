import { InternalError } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { removeStripeSubscriptionIdFromBillingPlan } from "@/internal/billing/v2/execute/removeStripeSubscriptionIdFromBillingPlan";
import type {
	BillingPlan,
	StripeSubscriptionAction,
} from "@/internal/billing/v2/types/billingPlan";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/stripeBillingPlanResult";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling";
import { insertMetadataFromBillingPlan } from "@/internal/metadata/utils/insertMetadataFromBillingPlan";

type InvoiceModeParams = {
	collection_method?: "send_invoice";
	days_until_due?: number;
};

const executeSubscriptionOperation = async ({
	ctx,
	billingContext,
	subscriptionAction,
	invoiceModeParams,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subscriptionAction: StripeSubscriptionAction;
	invoiceModeParams: InvoiceModeParams;
}) => {
	const { org, env } = ctx;
	const stripeClient = createStripeCli({ org, env });

	switch (subscriptionAction.type) {
		case "update": {
			let stripeSubscription = billingContext.stripeSubscription;
			if (
				stripeSubscription &&
				stripeSubscription.billing_mode.type !== "flexible"
			) {
				stripeSubscription = await stripeClient.subscriptions.migrate(
					stripeSubscription?.id,
					{
						billing_mode: { type: "flexible" },
					},
				);
			}

			return await stripeClient.subscriptions.update(
				subscriptionAction.stripeSubscriptionId,
				{
					...subscriptionAction.params,
					...invoiceModeParams,
					expand: ["latest_invoice"],
				},
			);
		}
		case "create":
			return await stripeClient.subscriptions.create({
				...subscriptionAction.params,
				...invoiceModeParams,
				expand: ["latest_invoice"],
			});
		case "cancel":
			return await stripeClient.subscriptions.cancel(
				subscriptionAction.stripeSubscriptionId,
				{
					expand: ["latest_invoice"],
				},
			);

		default:
			throw new InternalError({
				message: "Invalid subscription action type",
			});
	}
};

export const executeStripeSubscriptionAction = async ({
	ctx,
	billingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
}): Promise<StripeBillingPlanResult> => {
	// 1. Perform stripe subscription operation
	const { subscriptionAction } = billingPlan.stripe;

	if (!subscriptionAction) return {};

	// Invoice mode:
	const invoiceMode = billingContext.invoiceMode;
	const invoiceModeParams = invoiceMode
		? {
				collection_method: "send_invoice" as const,
				days_until_due: 30,
			}
		: {};

	ctx.logger.debug(
		`[executeStripeSubscriptionAction] Executing subscription operation: ${subscriptionAction.type}`,
	);
	let stripeSubscription: Stripe.Subscription | undefined =
		await executeSubscriptionOperation({
			ctx,
			billingContext,
			subscriptionAction,
			invoiceModeParams,
		});

	const latestStripeInvoice =
		subscriptionAction.type === "create"
			? (stripeSubscription.latest_invoice as Stripe.Invoice)
			: undefined;

	// Defer billing plan
	const enableProductAfterInvoice =
		invoiceMode?.enableProductImmediately === false;

	const invoiceActionRequired =
		subscriptionAction.type === "create" &&
		latestStripeInvoice?.status === "open";

	const deferBillingPlan = enableProductAfterInvoice || invoiceActionRequired;

	if (latestStripeInvoice) {
		ctx.logger.debug(
			`[executeStripeSubscriptionAction] Upserting invoice from billing: ${latestStripeInvoice.id}`,
		);
		await upsertInvoiceFromBilling({
			ctx,
			stripeInvoice: latestStripeInvoice,
			fullProducts: billingContext.fullProducts,
			fullCustomer: billingContext.fullCustomer,
		});
	}

	if (deferBillingPlan) {
		ctx.logger.debug(
			`[executeStripeSubscriptionAction] Inserting metadata from billing plan`,
		);
		await insertMetadataFromBillingPlan({
			ctx,
			billingPlan,
			billingContext,
			enableProductAfterInvoice,
			invoiceActionRequired,
			stripeInvoice: latestStripeInvoice,
		});

		return {
			stripeInvoice: latestStripeInvoice,
			stripeSubscription,
			deferred: true,
		};
	}

	addStripeSubscriptionIdToBillingPlan({
		autumnBillingPlan: billingPlan.autumn,
		stripeSubscriptionId: stripeSubscription.id,
	});

	// Add subscription to DB
	ctx.logger.debug(
		`[executeStripeSubscriptionAction] Upserting subscription from billing: ${stripeSubscription.id}`,
	);
	await upsertSubscriptionFromBilling({
		ctx,
		stripeSubscription,
	});

	// If the stripe subscription is canceled, remove the subscription from the billing plan
	if (isStripeSubscriptionCanceled(stripeSubscription)) {
		ctx.logger.debug(
			`[executeStripeSubscriptionAction] Subscription canceled, removing subscription from billing plan: ${stripeSubscription.id}`,
		);
		removeStripeSubscriptionIdFromBillingPlan({
			autumnBillingPlan: billingPlan.autumn,
			stripeSubscriptionId: stripeSubscription.id,
		});

		stripeSubscription = undefined;
	}

	return {
		stripeSubscription,
		stripeInvoice: latestStripeInvoice,
	};
};
