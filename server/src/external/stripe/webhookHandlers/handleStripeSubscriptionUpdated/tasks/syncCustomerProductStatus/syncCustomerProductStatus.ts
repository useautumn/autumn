import {
	AttachScenario,
	type CollectionMethod,
	CusProductStatus,
	cp,
	type FullCusProduct,
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

const isManualBillingUpdateInvoice = (
	invoice: { metadata?: Record<string, string> | null },
) =>
	invoice.metadata?.autumn_billing_update &&
	invoice.metadata?.autumn_invoice_mode !== "true";

const getInvoiceId = (invoice: string | { id?: string } | null | undefined) =>
	typeof invoice === "string" ? invoice : invoice?.id;

/** Manual billing-update invoices should not make an otherwise-active subscription past_due. */
const handleFalsePositivePastDue = async ({
	ctx,
	stripeSubscription,
	autumnStatus,
	previousAttributes,
	customerProducts,
}: {
	ctx: StripeWebhookContext;
	stripeSubscription: ExpandedStripeSubscription;
	autumnStatus: CusProductStatus;
	previousAttributes: SubscriptionPreviousAttributes;
	customerProducts: FullCusProduct[];
}): Promise<CusProductStatus> => {
	if (!isStripeSubscriptionPastDue(stripeSubscription)) return autumnStatus;

	if (previousAttributes.status === "past_due") return autumnStatus;

	const statusChanged = previousAttributes.status !== undefined;
	const latestInvoiceChanged = previousAttributes.latest_invoice !== undefined;
	if (!statusChanged && !latestInvoiceChanged) return autumnStatus;

	const hasActiveCustomerProduct = customerProducts.some((customerProduct) => {
		const { valid } = cp(customerProduct)
			.recurring()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });
		return valid && customerProduct.status === CusProductStatus.Active;
	});
	if (!hasActiveCustomerProduct) return autumnStatus;

	const latestInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: stripeSubscription.latest_invoice,
		expand: [],
	});

	if (!isManualBillingUpdateInvoice(latestInvoice)) return autumnStatus;

	if (!statusChanged) {
		const previousInvoiceId = getInvoiceId(previousAttributes.latest_invoice);
		if (!previousInvoiceId) return autumnStatus;

		const previousInvoice = await getStripeInvoice({
			stripeClient: ctx.stripeCli,
			invoiceId: previousInvoiceId,
			expand: [],
		});
		if (!isManualBillingUpdateInvoice(previousInvoice)) return autumnStatus;
	}

	return CusProductStatus.Active;
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
		customerProducts,
	});

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
