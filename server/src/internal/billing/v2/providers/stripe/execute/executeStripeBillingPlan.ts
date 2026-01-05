import { MetadataType } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionCanceled } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { removeStripeSubscriptionIdFromBillingPlan } from "@/internal/billing/v2/execute/removeStripeSubscriptionIdFromBillingPlan";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import type {
	AutumnBillingPlan,
	StripeBillingPlan,
	StripeInvoiceMetadata,
} from "@/internal/billing/v2/types/billingPlan";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { upsertSubscriptionFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertSubscriptionFromBilling";
import { addSubIdToCache } from "@/internal/customers/cusCache/subCacheUtils";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { generateId } from "@/utils/genUtils";

export const executeStripeBillingPlan = async ({
	ctx,
	stripeBillingPlan,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	stripeBillingPlan: StripeBillingPlan;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
}) => {
	const {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
	} = stripeBillingPlan;

	const enableProductImmediately =
		stripeInvoiceAction?.invoiceMode?.enableProductImmediately !== false;

	if (stripeInvoiceAction) {
		let invoiceMetadata: StripeInvoiceMetadata | undefined;

		if (!enableProductImmediately) {
			const metadataId = generateId("meta");
			await MetadataService.insert({
				db: ctx.db,
				data: {
					id: metadataId,
					type: MetadataType.DeferredAutumnBillingPlan,
					data: {
						orgId: ctx.org.id,
						env: ctx.env,
						autumnBillingPlan,
					},
				},
			});
			invoiceMetadata = { autumn_metadata_id: metadataId };
		}

		const { invoice } = await createInvoiceForBilling({
			ctx,
			billingContext,
			stripeInvoiceAction,
			invoiceMetadata,
		});

		if (invoice) {
			await upsertInvoiceFromBilling({
				ctx,
				stripeInvoice: invoice,
				fullProducts: billingContext.fullProducts,
				fullCustomer: billingContext.fullCustomer,
			});
		}
	}

	let stripeSubscription: Stripe.Subscription | undefined =
		billingContext.stripeSubscription;

	if (stripeSubscriptionAction) {
		// 1. Insert stripe subscription ID into cache
		if (stripeSubscription?.id) {
			await addSubIdToCache({
				subId: stripeSubscription.id,
				scenario: "billing",
			});
		}

		stripeSubscription = await executeStripeSubscriptionAction({
			ctx,
			subscriptionAction: stripeSubscriptionAction,
		});

		if (stripeSubscription) {
			addStripeSubscriptionIdToBillingPlan({
				autumnBillingPlan,
				stripeSubscriptionId: stripeSubscription.id,
			});

			// Add subscription to DB
			await upsertSubscriptionFromBilling({
				ctx,
				stripeSubscription,
			});
		}

		// If the stripe subscription is canceled, remove the subscription from the billing plan
		if (
			stripeSubscription &&
			isStripeSubscriptionCanceled(stripeSubscription)
		) {
			removeStripeSubscriptionIdFromBillingPlan({
				autumnBillingPlan,
				stripeSubscriptionId: stripeSubscription.id,
			});

			stripeSubscription = undefined;
		}
	}

	if (stripeSubscriptionScheduleAction) {
		const stripeSubscriptionSchedule =
			await executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext,
				subscriptionScheduleAction: stripeSubscriptionScheduleAction,
				stripeSubscription,
			});

		if (stripeSubscriptionSchedule) {
			addStripeSubscriptionScheduleIdToBillingPlan({
				autumnBillingPlan,
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
			});
		}
	}
};
