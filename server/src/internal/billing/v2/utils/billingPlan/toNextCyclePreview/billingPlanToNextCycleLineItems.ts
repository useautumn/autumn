import {
	type AutumnBillingPlan,
	type BillingContext,
	type FullCusProduct,
	ms,
	sumValues,
	timestampsMatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import { filterStripeDiscountsForNextCycle } from "@/internal/billing/v2/providers/stripe/utils/discounts/filterStripeDiscountsForNextCycle";
import { customerProductToArrearLineItems } from "../../lineItems/customerProductToArrearLineItems";
import { customerProductToLineItems } from "../../lineItems/customerProductToLineItems";
import { lineItemToPreviewLineItem } from "../../lineItems/lineItemToPreviewLineItem";
import { lineItemToPreviewUsageLineItem } from "../../lineItems/lineItemToPreviewUsageLineItem";

export const billingPlanToNextCycleLineItems = ({
	ctx,
	customerProducts,
	autumnBillingPlan,
	billingContext,
	nextCycleStart,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
	nextCycleStart: number;
}) => {
	const arrearLineItems = customerProducts.flatMap(
		(customerProduct) =>
			customerProductToArrearLineItems({
				ctx,
				customerProduct,
				billingContext: {
					...billingContext,
					currentEpochMs: nextCycleStart - ms.minutes(30),
				},
				options: { includeZeroAmounts: true },
			}).lineItems,
	);

	const previewUsageLineItems = arrearLineItems.map(
		lineItemToPreviewUsageLineItem,
	);

	const autumnLineItems = customerProducts.flatMap((customerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct,
			billingContext: {
				...billingContext,
				currentEpochMs: nextCycleStart,
			},
			direction: "charge",
		}),
	);

	// Only keep line items whose billing period starts at the next cycle.
	let nextCycleAutumnLineItems = autumnLineItems.filter(
		(lineItem) =>
			lineItem.context.billingPeriod?.start !== undefined &&
			timestampsMatch(lineItem.context.billingPeriod.start, nextCycleStart),
	);

	const deferredLineItems = (autumnBillingPlan.lineItems ?? []).filter(
		(lineItem) => lineItem.chargeImmediately === false,
	);

	if (billingContext.stripeDiscounts?.length) {
		const nextCycleDiscounts = filterStripeDiscountsForNextCycle({
			stripeDiscounts: billingContext.stripeDiscounts,
			currentEpochMs: billingContext.currentEpochMs,
			nextCycleStart,
		});

		nextCycleAutumnLineItems = applyStripeDiscountsToLineItems({
			lineItems: nextCycleAutumnLineItems,
			discounts: nextCycleDiscounts,
		});
	}

	const previewLineItems = [
		...nextCycleAutumnLineItems,
		...deferredLineItems,
	].map(lineItemToPreviewLineItem);

	const subtotal = sumValues(previewLineItems.map((line) => line.subtotal));
	const total = sumValues(previewLineItems.map((line) => line.total));

	return { previewLineItems, previewUsageLineItems, subtotal, total };
};
