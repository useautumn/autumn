import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import type {
	BillingPlan,
	StripeInvoiceMetadata,
} from "@/internal/billing/v2/types/billingPlan";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/stripeBillingPlanResult";
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

	const { invoice } = await createInvoiceForBilling({
		ctx,
		billingContext,
		stripeInvoiceAction,
		invoiceMetadata,
	});

	const enableProductAfterInvoice =
		billingContext.invoiceMode?.enableProductImmediately === false;
	const invoiceActionRequired = invoice.status === "open";

	// Insert metadata into DB
	const deferBillingPlan = enableProductAfterInvoice || invoiceActionRequired;
	if (deferBillingPlan) {
		logger.debug(
			`Deferring billing plan, enableProductAfterInvoice: ${enableProductAfterInvoice}, invoiceActionRequired: ${invoiceActionRequired}`,
		);
		await insertMetadataFromBillingPlan({
			ctx,
			billingPlan,
			billingContext,
			enableProductAfterInvoice,
			invoiceActionRequired,
			stripeInvoice: invoice,
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
