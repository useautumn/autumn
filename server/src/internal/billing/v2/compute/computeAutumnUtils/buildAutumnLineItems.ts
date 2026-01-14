import type { FullCusProduct, LineItem } from "@autumn/shared";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { customerProductToLineItems } from "../../utils/lineItems/customerProductToLineItems";
import { logBuildAutumnLineItems } from "./logBuildAutumnLineItems";

export const buildAutumnLineItems = ({
	ctx,
	newCustomerProducts,
	deletedCustomerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	newCustomerProducts: FullCusProduct[];
	deletedCustomerProduct?: FullCusProduct;
	billingContext: BillingContext;
}) => {
	const { logger } = ctx;

	// For now, update subscription doesn't charge for existing usage.
	const arrearLineItems: LineItem[] = [];
	// cusProductToArrearLineItems({
	// 	cusProduct: deletedCustomerProduct,
	// 	billingCycleAnchorMs,
	// 	nowMs: currentEpochMs,
	// 	org,
	// })

	// Get line items for ongoing cus product
	const deletedLineItems = deletedCustomerProduct
		? customerProductToLineItems({
				ctx,
				customerProduct: deletedCustomerProduct,
				billingContext,
				direction: "refund",
				priceFilters: { excludeOneOffPrices: true },
			})
		: [];

	const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct: newCustomerProduct,
			billingContext,
			direction: "charge",
		}),
	);

	// Combine all line items - trial filtering and unchanged price filtering
	// will be handled in finalizeUpdateSubscriptionPlan
	const allLineItems = [...deletedLineItems, ...newLineItems];

	logBuildAutumnLineItems({
		logger,
		deletedLineItems,
		newLineItems,
	});

	return allLineItems;
};
