import {
	type Entity,
	ErrCode,
	RecaseError,
	type StripeBillingPlanResult,
} from "@autumn/shared";
import { voidStripeInvoiceIfOpen } from "@/external/stripe/invoices/operations/voidStripeInvoiceIfOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AllocatedInvoiceContext } from "@/internal/balances/utils/allocatedInvoice/allocatedInvoiceContext.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan.js";
import { upsertInvoiceFromBilling } from "@/internal/billing/v2/utils/upsertFromStripe/upsertInvoiceFromBilling.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated.js";
import { computeCreateEntitiesPlan } from "./compute/computeCreateEntitiesPlan.js";
import { mergeAllocatedInvoicePlan } from "./compute/mergeAllocatedInvoicePlan.js";
import { handleCreateEntitiesErrors } from "./errors/handleCreateEntitiesErrors.js";
import { setupCreateEntitiesContext } from "./setup/setupCreateEntitiesContext.js";
import { setupEntityBillingContext } from "./setup/setupEntityBillingContext.js";
import type { CreateEntitiesParams } from "./types/createEntitiesParams.js";

/** Seats are charged before any row is written: an unpaid invoice is voided and nothing else happens. */
const refuseUnpaidInvoice = async ({
	ctx,
	billingContext,
	stripeResult,
}: {
	ctx: AutumnContext;
	billingContext: AllocatedInvoiceContext;
	stripeResult: StripeBillingPlanResult;
}) => {
	const { stripeInvoice } = stripeResult;
	if (!stripeInvoice || stripeInvoice.status === "paid") return;

	const voidedInvoice = await voidStripeInvoiceIfOpen({ ctx, stripeInvoice });
	if (voidedInvoice) {
		await upsertInvoiceFromBilling({
			ctx,
			stripeInvoice: voidedInvoice,
			fullProducts: billingContext.fullProducts,
			fullCustomer: billingContext.fullCustomer,
		});
	}

	throw new RecaseError({
		message:
			stripeResult.requiredAction?.reason ??
			`Failed to pay invoice for feature ${billingContext.customerEntitlement.entitlement.feature.id}: check the customer's payment method and retry`,
		code: ErrCode.PayInvoiceFailed,
		statusCode: 402,
		data: voidedInvoice ?? stripeInvoice,
	});
};

/** Entity creation as one billing plan: setup → errors → compute → Stripe → execute. */
export const createEntitiesV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateEntitiesParams;
}): Promise<{ entities: Entity[] }> => {
	const context = await setupCreateEntitiesContext({ ctx, params });

	handleCreateEntitiesErrors({ context, params });

	let autumnBillingPlan = computeCreateEntitiesPlan({ ctx, context });

	const billingContext = await setupEntityBillingContext({ ctx, context });
	let stripeResult: StripeBillingPlanResult = {};
	if (billingContext) {
		autumnBillingPlan = mergeAllocatedInvoicePlan({
			ctx,
			context,
			autumnBillingPlan,
			billingContext,
		});
		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
		stripeResult = await executeStripeBillingPlan({
			ctx,
			billingContext,
			billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
		});
		await refuseUnpaidInvoice({ ctx, billingContext, stripeResult });
	}

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan,
		stripeInvoice: stripeResult.stripeInvoice,
		stripeInvoiceItems: stripeResult.stripeInvoiceItems,
		autumnInvoice: stripeResult.autumnInvoice,
	});

	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan,
		billingContext: context,
	});
	// Fire-and-forget, as customer creation does
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan,
		originalFullCustomer: context.fullCustomer,
	});

	return {
		entities: [
			...context.insertedEntities,
			...(context.claimedEntity ? [context.claimedEntity.claimed] : []),
		],
	};
};
