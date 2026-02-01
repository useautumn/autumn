import type {
	BillingContext,
	BillingPlan,
	StripeBillingPlanResult,
	StripeInvoiceMetadata,
} from "@autumn/shared";
import { ms, StripeBillingStage } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { shouldDeferBillingPlan } from "@/internal/billing/v2/providers/stripe/utils/common/shouldDeferBillingPlan";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling";
import { insertMetadataFromBillingPlan } from "@/internal/metadata/utils/insertMetadataFromBillingPlan";

export const executeStripeInvoiceAction = async ({
	ctx,
	billingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
}): Promise<StripeBillingPlanResult> => {
	const { logger } = ctx;

	let invoiceMetadata: StripeInvoiceMetadata | undefined;

	const { invoiceAction: stripeInvoiceAction } = billingPlan.stripe;

	if (!stripeInvoiceAction) {
		return { stripeInvoice: undefined };
	}

	logger.debug("[executeStripeInvoiceAction] Creating invoice for billing");

	const { invoice, requiredAction } = await createInvoiceForBilling({
		ctx,
		billingContext,
		stripeInvoiceAction,
		invoiceMetadata,
	});

	// Insert metadata into DB

	const deferBillingPlan = shouldDeferBillingPlan({
		billingContext,
		latestStripeInvoice: invoice,
		requiredAction,
	});

	const deferredInvoiceMode = isDeferredInvoiceMode({
		billingContext,
	});

	if (deferBillingPlan) {
		logger.debug(`Deferring billing plan`);

		await insertMetadataFromBillingPlan({
			ctx,
			billingPlan,
			billingContext,
			stripeInvoice: invoice,
			expiresAt: deferredInvoiceMode
				? Date.now() + ms.days(10)
				: Date.now() + ms.days(30),
			resumeAfter: StripeBillingStage.InvoiceAction,
		});

		await upsertInvoiceFromBilling({
			ctx,
			stripeInvoice: invoice,
			fullProducts: billingContext.fullProducts,
			fullCustomer: billingContext.fullCustomer,
		});

		return {
			stripeInvoice: invoice,
			deferred: true,
			requiredAction,
		};
	}

	if (invoice) {
		logger.debug("[executeStripeInvoiceAction] Upserting invoice from billing");
		await upsertInvoiceFromBilling({
			ctx,
			stripeInvoice: invoice,
			fullProducts: billingContext.fullProducts,
			fullCustomer: billingContext.fullCustomer,
		});
	}

	logger.debug(
		`[executeStripeInvoiceAction] Completed, invoice: ${invoice?.id}`,
	);

	return { stripeInvoice: invoice };
};
