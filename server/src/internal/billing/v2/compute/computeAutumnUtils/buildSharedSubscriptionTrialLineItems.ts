import { cp, type FullCusProduct, type LineItem } from "@autumn/shared";
import chalk from "chalk";
import type { Logger } from "@/external/logtail/logtailUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/types";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";

const formatLineItem = (item: LineItem) => ({
	description: item.description,
	amount: item.amount,
	finalAmount: item.finalAmount,
});

const logSharedSubscriptionTrialLineItems = ({
	logger,
	direction,
	siblingCustomerProducts,
	lineItems,
}: {
	logger: Logger;
	direction: "charge" | "refund";
	siblingCustomerProducts: FullCusProduct[];
	lineItems: LineItem[];
}) => {
	const formatLineItemCompact = (item: LineItem) =>
		`  ${item.description}: ${chalk.yellow(item.finalAmount.toFixed(2))}`;

	// Structured info log
	// logger.info(`buildSharedSubscriptionTrialLineItems data`, {
	// 	data: {
	// 		direction,
	// 		sibilingCustomerProducts: siblingCustomerProducts.map(
	// 			(customerProduct) => ({
	// 				id: customerProduct.id,
	// 				productId: customerProduct.product?.id,
	// 				entityId: customerProduct.entity_id,
	// 			}),
	// 		),
	// 		lineItems: lineItems.map(formatLineItem),
	// 	},
	// });

	// Debug output
	logger.debug("========== [buildSharedSubscriptionTrialLineItems] ==========");
	logger.debug("");
	logger.debug(`direction: ${direction}`);
	logger.debug(
		`siblingCustomerProducts: ${siblingCustomerProducts.map((cp) => cp.id).join(", ")}`,
	);
	logger.debug("");
	logger.debug("lineItems:");
	if (lineItems.length === 0) logger.debug("  (none)");
	else for (const item of lineItems) logger.debug(formatLineItemCompact(item));
	logger.debug("");
	logger.debug(
		"==============================================================",
	);
};

/** Filter for sibling customer products on the same Stripe subscription. */
const getSiblingCustomerProducts = ({
	customerProducts,
	autumnBillingPlan,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionId: string;
}): FullCusProduct[] => {
	const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
		autumnBillingPlan,
	});

	const handledIds = new Set([
		...autumnBillingPlan.insertCustomerProducts.map((cp) => cp.id),
		updatedCustomerProduct?.id,
		autumnBillingPlan.deleteCustomerProduct?.id,
	]);

	return customerProducts.filter((customerProduct) => {
		if (handledIds.has(customerProduct.id)) return false;

		return cp(customerProduct)
			.paid()
			.recurring()
			.onStripeSubscription({ stripeSubscriptionId }).valid;
	});
};

/**
 * Builds line items for sibling customer products on a shared Stripe subscription
 * when trial state changes (trialing → no trial or no trial → trialing).
 */
export const buildSharedSubscriptionTrialLineItems = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): LineItem[] => {
	const { logger } = ctx;
	const { fullCustomer, stripeSubscription } = billingContext;

	if (!stripeSubscription) return [];

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	// Determine direction based on trial state change
	let direction: "charge" | "refund" | null = null;
	if (isTrialing && !willBeTrialing) {
		direction = "charge"; // Ending trial → charge for sibling products
	} else if (!isTrialing && willBeTrialing) {
		direction = "refund"; // Starting trial → refund sibling products
	}

	if (!direction) return [];

	const siblingCustomerProducts = getSiblingCustomerProducts({
		customerProducts: fullCustomer.customer_products,
		autumnBillingPlan,
		stripeSubscriptionId: stripeSubscription.id,
	});

	if (siblingCustomerProducts.length === 0) return [];

	const lineItems: LineItem[] = [];
	for (const customerProduct of siblingCustomerProducts) {
		lineItems.push(
			...customerProductToLineItems({
				ctx,
				customerProduct: customerProduct,
				billingContext,
				direction,
				priceFilters: { excludeOneOffPrices: true },
			}),
		);
	}

	logSharedSubscriptionTrialLineItems({
		logger,
		direction,
		siblingCustomerProducts,
		lineItems,
	});

	return lineItems;
};
