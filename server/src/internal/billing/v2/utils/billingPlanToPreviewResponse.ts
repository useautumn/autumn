import type { BillingContext, BillingPlan } from "@autumn/shared";
import {
	type BillingPreviewResponse,
	billingContextResetsUsage,
	billingContextToCurrency,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeNextCycleTaxPreview } from "./billingPlan/preview/tax/computeNextCycleTaxPreview";
import { billingPlanToImmediatePreview } from "./billingPlan/toImmediatePreview/billingPlanToImmediatePreview";
import { billingPlanToNextCyclePreview } from "./billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";
import { billingPlanToChanges } from "./billingPlan/toPreviewChanges/billingPlanToChanges";
import { logBillingPreview } from "./logs/logBillingPreview";

const applyNextCycleTaxPreview = async ({
	ctx,
	billingContext,
	billingPlan,
	nextCycle,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	nextCycle: BillingPreviewResponse["next_cycle"];
}): Promise<BillingPreviewResponse["next_cycle"]> => {
	if (!nextCycle || !billingPlan.preview) return nextCycle;

	const tax = await computeNextCycleTaxPreview({
		ctx,
		billingContext,
		netSubtotal: nextCycle.total,
	});
	if (!tax) return nextCycle;

	return {
		...nextCycle,
		total: new Decimal(nextCycle.total).add(tax.total).toDP(2).toNumber(),
	};
};

const applyPreviewAdjustmentsToTotal = ({
	subtotal,
	total,
	billingPlan,
}: {
	subtotal: number;
	total: number;
	billingPlan: BillingPlan;
}): { total: number; creditApplied: number } => {
	const taxTotal = billingPlan.preview?.tax?.total ?? 0;
	const creditBalance = billingPlan.preview?.invoiceCredits?.balance ?? 0;

	const taxed = new Decimal(total).add(taxTotal);
	const cappedCredit = Decimal.min(creditBalance, Decimal.max(taxed, 0));
	return {
		total: taxed.sub(cappedCredit).toDP(2).toNumber(),
		creditApplied: cappedCredit.toDP(2).toNumber(),
	};
};

export const billingPlanToPreviewResponse = async ({
	ctx,
	billingContext,
	billingPlan,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	nextCycleStripeSubscriptionId?: string;
}): Promise<BillingPreviewResponse & { credit_applied: number }> => {
	const { fullCustomer } = billingContext;

	const autumnBillingPlan = billingPlan.autumn;
	const allLineItems = autumnBillingPlan.lineItems ?? [];
	const currency = billingContextToCurrency({ org: ctx.org, billingContext });

	const {
		immediateLineItems,
		previewLineItems,
		subtotal,
		total: lineItemsTotal,
	} = billingPlanToImmediatePreview({
		billingContext,
		billingPlan,
		currency,
	});

	const { total, creditApplied } = applyPreviewAdjustmentsToTotal({
		subtotal,
		total: lineItemsTotal,
		billingPlan,
	});

	const { nextCycle: rawNextCycle, debug: nextCycleDebug } =
		billingPlanToNextCyclePreview({
			ctx,
			billingContext,
			billingPlan,
			nextCycleStripeSubscriptionId,
		});

	const nextCycle = await applyNextCycleTaxPreview({
		ctx,
		billingContext,
		billingPlan,
		nextCycle: rawNextCycle,
	});

	logBillingPreview({
		ctx,
		allLineItems,
		immediateLineItems,
		total,
		currency,
		nextCycleDebug,
		nextCycle,
	});

	const { incoming, outgoing } = await billingPlanToChanges({
		ctx,
		billingContext,
		billingPlan,
	});

	return {
		object: "billing_preview" as const,
		customer_id: fullCustomer.id || "",
		line_items: previewLineItems,
		subtotal,
		total,
		credit_applied: creditApplied,
		currency,
		resets_usage: billingContextResetsUsage(billingContext),
		next_cycle: nextCycle,
		incoming,
		outgoing,
		refund: autumnBillingPlan.refundPlan,
	};
};
