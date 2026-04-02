import {
	AttachScenario,
	type CollectionMethod,
	CusProductStatus,
	cp,
	type InsertCustomerProduct,
} from "@autumn/shared";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import { isStripeSubscriptionPastDue } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import {
	stripeSubscriptionToAutumnStatus,
	stripeSubscriptionToTrialEndsAtMs,
} from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
import type {
	StripeSubscriptionUpdatedContext,
	SubscriptionPreviousAttributes,
} from "../../stripeSubscriptionUpdatedContext";
import { fixUnexpectedStatuses } from "./fixUnexpectedStatuses";

/**
 * In cases where a manual invoice was created due to an upgrade, we don't want to treat it as a past due.
 * Only applies when the subscription just transitioned to past_due from a healthy state.
 * If the sub was already past_due before this event, it's a real past_due.
 */
const handleFalsePositivePastDue = async ({
	ctx,
	stripeSubscription,
	autumnStatus,
	previousAttributes,
}: {
	ctx: StripeWebhookContext;
	stripeSubscription: ExpandedStripeSubscription;
	autumnStatus: CusProductStatus;
	previousAttributes: SubscriptionPreviousAttributes;
}): Promise<CusProductStatus> => {
	if (!isStripeSubscriptionPastDue(stripeSubscription)) return autumnStatus;

	// If the status didn't change in this event or was already past_due,
	// the subscription was genuinely past_due — don't override.
	const wasAlreadyPastDue =
		previousAttributes.status === undefined ||
		previousAttributes.status === "past_due";
	if (wasAlreadyPastDue) return autumnStatus;

	const latestInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: stripeSubscription.latest_invoice,
		expand: [],
	});

	const metadata = latestInvoice?.metadata;

	if (
		metadata?.autumn_billing_update &&
		metadata?.autumn_invoice_mode !== "true"
	) {
		return CusProductStatus.Active;
	}

	return autumnStatus;
};

/**
 * Syncs customer product status, trial_ends_at, and collection_method from Stripe subscription.
 *
 * This function:
 * 1. Iterates through customer products on the stripe subscription
 * 2. Updates status to match Stripe (SKIPPING Scheduled products)
 * 3. Updates trial_ends_at and collection_method
 * 4. Sends PastDue webhook if status transitions to PastDue
 * 5. Does a cursory DB update for any customer products with unexpected statuses (safety net)
 */
export const syncCustomerProductStatus = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { db, logger, org, env } = ctx;
	const {
		stripeSubscription,
		customerProducts,
		fullCustomer,
		previousAttributes,
	} = subscriptionUpdatedContext;

	// Map Stripe status to Autumn status
	let autumnStatus = stripeSubscriptionToAutumnStatus({
		stripeStatus: stripeSubscription.status,
	});

	autumnStatus = await handleFalsePositivePastDue({
		ctx,
		stripeSubscription,
		autumnStatus,
		previousAttributes,
	});

	// Don't transition autumn status to past_due if the stripe invoice has metadata: autumn_billing_update, and invoice_mode is false.

	// Get trial_ends_at and collection_method from Stripe
	const trialEndsAt = stripeSubscriptionToTrialEndsAtMs({ stripeSubscription });
	const collectionMethod =
		stripeSubscription.collection_method as CollectionMethod;

	// Update customer products on this subscription
	for (const customerProduct of customerProducts) {
		// Skip if not on this subscription

		const { valid } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!valid) continue;

		// Build updates
		const updates: Partial<InsertCustomerProduct> = {};

		// Update status if changed
		if (customerProduct.status !== autumnStatus) {
			updates.status = autumnStatus;
		}

		// Sync trial_ends_at (normalize null/undefined comparison)
		const currentTrialEndsAt = customerProduct.trial_ends_at ?? null;
		const newTrialEndsAt = trialEndsAt ?? null;
		if (currentTrialEndsAt !== newTrialEndsAt) {
			updates.trial_ends_at = newTrialEndsAt;
		}

		// Sync collection_method
		if (customerProduct.collection_method !== collectionMethod) {
			updates.collection_method = collectionMethod;
		}

		// Skip if nothing to update
		if (Object.keys(updates).length === 0) continue;

		logger.debug(
			`[syncCustomerProductStatus] Updating ${customerProduct.product.name}`,
			{ data: updates },
		);

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});

		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		// Send PastDue webhook if transitioning to PastDue
		const isTransitioningToPastDue =
			updates.status === CusProductStatus.PastDue;

		if (isTransitioningToPastDue && org.config.sync_status) {
			await addProductsUpdatedWebhookTask({
				ctx,
				internalCustomerId: fullCustomer.internal_id,
				org,
				env,
				customerId: fullCustomer.id ?? null,
				scenario: AttachScenario.PastDue,
				cusProduct: customerProduct,
			});
		}
	}

	// Safety net: fix any customer products with unexpected statuses
	await fixUnexpectedStatuses({
		ctx,
		stripeSubscription,
		fullCustomer,
		autumnStatus,
		trialEndsAt,
		collectionMethod,
	});
};
