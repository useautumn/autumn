import type {
	AutumnBillingPlan,
	BillingContext,
	PreviewBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachInvoiceCreditPreview } from "./invoiceCredits/computeAttachInvoiceCreditPreview";
import { computeAttachTaxPreview } from "./tax/computeAttachTaxPreview";
import { computeAttachTaxRateIdPreview } from "./tax/computeAttachTaxRateIdPreview";

export const computeAttachPreviewBillingPlan = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewBillingPlan> => {
	// tax_rate_id overrides automatic_tax on the real Stripe subscription,
	const taxPromise = billingContext.taxRateId
		? computeAttachTaxRateIdPreview({ ctx, billingContext, autumnBillingPlan })
		: computeAttachTaxPreview({ ctx, billingContext, autumnBillingPlan });

	const [tax, invoiceCredits] = await Promise.all([
		taxPromise,
		Promise.resolve(
			computeAttachInvoiceCreditPreview({ ctx, billingContext }),
		),
	]);

	return { tax, invoiceCredits };
};
