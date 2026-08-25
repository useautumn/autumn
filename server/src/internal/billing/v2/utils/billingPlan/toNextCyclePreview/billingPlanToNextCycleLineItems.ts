import {
	type AutumnBillingPlan,
	type BillingContext,
	type FullCusProduct,
	isCustomerEntitlementDueAtInvoice,
	type LineItem,
	ms,
	sumValues,
	timestampsMatch,
} from "@autumn/shared";
import { partitionSkippedOverageLineItems } from "@/external/stripe/webhookHandlers/common/filterSkippedOverageLineItems";
import { shouldDisableOverageBilling } from "@/external/stripe/webhookHandlers/common/shouldDisableOverageBilling.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import { filterStripeDiscountsForNextCycle } from "@/internal/billing/v2/providers/stripe/utils/discounts/filterStripeDiscountsForNextCycle";
import { customerProductToArrearLineItems } from "../../lineItems/customerProductToArrearLineItems";
import { getLineItemsForDirection } from "../../lineItems/getLineItemsForDirection";
import { lineItemToPreviewLineItem } from "../../lineItems/lineItemToPreviewLineItem";
import { lineItemToPreviewUsageLineItem } from "../../lineItems/lineItemToPreviewUsageLineItem";

export type NextCycleLineItemOptions = {
	/**
	 * Bill the usage line items instead of listing them as amount-less
	 * placeholders. Attach-style previews can't know future usage; an invoice
	 * preview projects the usage accrued so far onto the closing cycle.
	 */
	chargeUsageLineItems?: boolean;
};

type NextCycleLineItemSpec = {
	customerProducts: FullCusProduct[];
	direction: "charge" | "refund";
	billingContext?: BillingContext;
	billingCycleAnchorMs?: BillingContext["billingCycleAnchorMs"];
	filterBillingPeriodStart?: boolean;
	priceFilters?: {
		excludeOneOffPrices?: boolean;
	};
};

const buildLineItemsForSpec = ({
	ctx,
	spec,
	billingContext,
	nextCycleStart,
}: {
	ctx: AutumnContext;
	spec: NextCycleLineItemSpec;
	billingContext: BillingContext;
	nextCycleStart: number;
}) => {
	const lineItems = spec.customerProducts.flatMap((customerProduct) =>
		getLineItemsForDirection({
			ctx,
			customerProduct,
			billingContext: {
				...billingContext,
				...spec.billingContext,
				currentEpochMs: nextCycleStart,
				subscriptionBackdateStartMs: undefined,
			},
			direction: spec.direction,
			priceFilters: spec.priceFilters,
			billingCycleAnchorMsOverride: spec.billingCycleAnchorMs,
		}),
	);

	if (spec.filterBillingPeriodStart === false) return lineItems;

	return lineItems.filter(
		(lineItem) =>
			lineItem.context.billingPeriod?.start !== undefined &&
			timestampsMatch(lineItem.context.billingPeriod.start, nextCycleStart),
	);
};

const prefixRefundDescriptions = ({ lineItems }: { lineItems: LineItem[] }) =>
	lineItems.map((lineItem) => {
		if (lineItem.context.direction !== "refund") return lineItem;
		if (lineItem.description.startsWith("Unused ")) return lineItem;

		return {
			...lineItem,
			description: `Unused ${lineItem.description}`,
		};
	});

export const billingPlanToNextCycleLineItems = ({
	ctx,
	customerProducts,
	productsForUsageLineItems = customerProducts,
	lineItemSpecs = [
		{
			customerProducts,
			direction: "charge",
		},
	],
	autumnBillingPlan,
	billingContext,
	nextCycleStart,
	options = {},
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
	productsForUsageLineItems?: FullCusProduct[];
	lineItemSpecs?: NextCycleLineItemSpec[];
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
	nextCycleStart: number;
	options?: NextCycleLineItemOptions;
}) => {
	const disableOverageBilling = shouldDisableOverageBilling({
		org: ctx.org,
		customerId: billingContext.fullCustomer.id,
		customerConfig: billingContext.fullCustomer.config,
	});
	const arrearResults = productsForUsageLineItems.map((customerProduct) =>
		customerProductToArrearLineItems({
			ctx,
			customerProduct,
			billingContext: {
				...billingContext,
				currentEpochMs: nextCycleStart - ms.minutes(30),
			},
			filters: {
				invoiceCreditCusEntFilter: (customerEntitlement) =>
					isCustomerEntitlementDueAtInvoice({
						customerEntitlement,
						invoicePeriodEndMs: nextCycleStart,
					}),
			},
			options: {
				includeZeroAmounts: true,
				invoiceCredits: options.chargeUsageLineItems
					? { fullyOffsetOverage: disableOverageBilling }
					: undefined,
			},
		}),
	);
	const arrearLineItems = arrearResults.flatMap((result) => result.lineItems);
	const invoiceCreditLineItems = arrearResults.flatMap(
		(result) => result.invoiceCreditLineItems,
	);

	const previewUsageLineItems = arrearLineItems.map(
		lineItemToPreviewUsageLineItem,
	);

	let nextCycleAutumnLineItems = lineItemSpecs.flatMap((spec) =>
		buildLineItemsForSpec({
			ctx,
			spec,
			billingContext,
			nextCycleStart,
		}),
	);
	nextCycleAutumnLineItems = prefixRefundDescriptions({
		lineItems: nextCycleAutumnLineItems,
	});

	// Folded in before the discount pass so an amount-off coupon spreads across
	// usage and recurring charges together, as it will on the real invoice.
	if (options.chargeUsageLineItems) {
		const { billableLineItems } = partitionSkippedOverageLineItems({
			fullCustomer: billingContext.fullCustomer,
			lineItems: arrearLineItems,
		});
		nextCycleAutumnLineItems = [
			...nextCycleAutumnLineItems,
			...billableLineItems,
			...invoiceCreditLineItems,
		];
	}

	const deferredLineItems = (autumnBillingPlan.lineItems ?? []).filter(
		(lineItem) => lineItem.chargeImmediately === false,
	);

	if (billingContext.stripeDiscounts?.length) {
		// Mirrors buildStripeInvoiceAction's condition for creating an invoice now.
		const hasImmediateInvoice = (autumnBillingPlan.lineItems ?? []).some(
			(lineItem) => lineItem.chargeImmediately && lineItem.amount !== 0,
		);

		const nextCycleDiscounts = filterStripeDiscountsForNextCycle({
			stripeDiscounts: billingContext.stripeDiscounts,
			currentEpochMs: billingContext.currentEpochMs,
			nextCycleStart,
			discountStartMs: billingContext.subscriptionBackdateStartMs,
			hasImmediateInvoice,
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
