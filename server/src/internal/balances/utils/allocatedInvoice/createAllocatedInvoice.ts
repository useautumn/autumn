import {
	ErrCode,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	InternalError,
	isUsageBasedAllocatedCustomerEntitlement,
	RecaseError,
} from "@autumn/shared";
import { voidStripeInvoiceIfOpen } from "@/external/stripe/invoices/operations/voidStripeInvoiceIfOpen";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling.js";
import type { DeductionUpdate } from "../types/deductionUpdate";
import { computeAllocatedInvoicePlan } from "./compute/computeAllocatedInvoicePlan";
import { refreshDeductionUpdate } from "./refreshDeductionUpdate";
import { setupAllocatedInvoiceContext } from "./setupAllocatedInvoiceContext";

export const createAllocatedInvoice = async ({
	ctx,
	customerEntitlement,
	oldFullCustomer,
	update,
}: {
	ctx: AutumnContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	oldFullCustomer: FullCustomer;
	update: DeductionUpdate;
}) => {
	if (!isUsageBasedAllocatedCustomerEntitlement(customerEntitlement)) return;

	const billingContext = await setupAllocatedInvoiceContext({
		ctx,
		oldFullCustomer,
		customerEntitlement,
		update,
	});

	if (!billingContext) {
		throw new InternalError({
			message: "setupAllocatedInvoiceContext: no billing context found",
		});
	}

	if (billingContext.previousUsage === billingContext.newUsage) {
		ctx.logger.info(`createAllocatedInvoice: usage is the same, skipping`);
		return;
	}

	const plan = computeAllocatedInvoicePlan({
		ctx,
		billingContext,
	});

	if (!plan) {
		ctx.logger.info(`computeAllocatedInvoicePlan: no plan returned, skipping`);
		return;
	}

	logAutumnBillingPlan({ ctx, plan, billingContext });

	// Evaluate stripe billing plan
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan: plan,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	// Execute stripe billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan: { autumn: plan, stripe: stripeBillingPlan },
	});

	logStripeBillingResult({ ctx, result: billingResult.stripe });

	// Mutate the update object so applyDeductionUpdateToFullCustomer
	// sees the replaceables and balance changes made by the billing plan.
	refreshDeductionUpdate({ update, plan });

	const stripeInvoice = billingResult.stripe.stripeInvoice;
	if (stripeInvoice && stripeInvoice.status !== "paid") {
		const voidedInvoice = await voidStripeInvoiceIfOpen({
			ctx,
			stripeInvoice,
		});

		if (voidedInvoice) {
			await upsertInvoiceFromBilling({
				ctx,
				stripeInvoice: voidedInvoice,
				fullProducts: billingContext.fullProducts,
				fullCustomer: billingContext.fullCustomer,
			});
		}

		throw new RecaseError({
			message: `Failed to pay invoice for feature ${customerEntitlement.entitlement.feature.id}`,
			code: ErrCode.PayInvoiceFailed,
			statusCode: 400,
			data: voidedInvoice ?? stripeInvoice,
		});
	}
};
