import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
	LineItem,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import { clampNextResetAtToPendingBillingCycleAnchor } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { extractStripeDiscounts } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import {
	type BaseWebhookEventContext,
	buildBillingContextForArrearInvoice,
} from "./buildBillingContextFromWebhook";
import { partitionSkippedOverageLineItems } from "./filterSkippedOverageLineItems";
import { logWebhookArrearLineItems } from "./logs/logWebhookArrearLineItems";

export const eventContextToArrearLineItems = async ({
	ctx,
	eventContext,
	periodEndMs,
	cusEntFilter,
	stripeDiscountable = true,
	idempotencyScope,
	invoiceCredits,
}: {
	ctx: StripeWebhookContext;
	eventContext: BaseWebhookEventContext;
	periodEndMs?: number;
	cusEntFilter?: (cusEnt: FullCusEntWithFullCusProduct) => boolean;
	stripeDiscountable?: boolean;
	idempotencyScope?: string;
	invoiceCredits?: {
		cusEntFilter?: (cusEnt: FullCusEntWithFullCusProduct) => boolean;
		idempotencyScope?: string;
		fullyOffsetOverage?: boolean;
		includeLineItems?: boolean;
	};
}): Promise<{
	lineItems: LineItem[];
	invoiceCreditLineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
	billingContext: BillingContext;
}> => {
	const billingContext = buildBillingContextForArrearInvoice({
		eventContext,
		periodEndMs,
	});

	let lineItems: LineItem[] = [];
	const invoiceCreditLineItems: LineItem[] = [];
	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];
	for (const customerProduct of eventContext.customerProducts) {
		const {
			lineItems: productLineItems,
			invoiceCreditLineItems: productInvoiceCreditLineItems,
			updateCustomerEntitlements: productUpdates,
		} = customerProductToArrearLineItems({
			ctx,
			customerProduct,
			billingContext,
			filters: {
				cusEntFilter,
				invoiceCreditCusEntFilter: invoiceCredits?.cusEntFilter,
			},
			options: {
				updateNextResetAt: true,
				discountable: stripeDiscountable,
				idempotencyScope,
				invoiceCredits: invoiceCredits
					? {
							idempotencyScope: invoiceCredits.idempotencyScope,
							fullyOffsetOverage: invoiceCredits.fullyOffsetOverage,
							includeLineItems: invoiceCredits.includeLineItems,
						}
					: undefined,
			},
		});
		for (const update of productUpdates) {
			const nextResetAt = update.updates?.next_reset_at;
			if (typeof nextResetAt !== "number") continue;

			update.updates = {
				...update.updates,
				next_reset_at: clampNextResetAtToPendingBillingCycleAnchor({
					billingCycleAnchorResetsAt:
						customerProduct.billing_cycle_anchor_resets_at,
					currentEpochMs: eventContext.nowMs,
					nextResetAt,
				}),
			};
		}
		lineItems.push(...productLineItems);
		invoiceCreditLineItems.push(...productInvoiceCreditLineItems);
		updateCustomerEntitlements.push(...productUpdates);
	}

	// Note: discountable: true lets Stripe auto-apply discounts, but we still
	const discounts = await extractStripeDiscounts({
		ctx,
		stripeSubscription: eventContext.stripeSubscription,
		stripeCustomer: eventContext.stripeCustomer,
	});

	if (discounts.length > 0) {
		lineItems = applyStripeDiscountsToLineItems({
			lineItems,
			discounts,
			options: { skipDescriptionTag: true },
		});
	}

	const { billableLineItems, skippedLineItems } =
		partitionSkippedOverageLineItems({
			fullCustomer: billingContext.fullCustomer,
			lineItems,
		});

	logWebhookArrearLineItems({
		ctx,
		lineItems: billableLineItems,
		skippedLineItems,
		updateCustomerEntitlements,
	});

	return {
		lineItems: billableLineItems,
		invoiceCreditLineItems,
		updateCustomerEntitlements,
		billingContext,
	};
};
