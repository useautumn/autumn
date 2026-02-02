import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { customerProductToLineItems } from "../../utils/lineItems/customerProductToLineItems";
import { logBuildAutumnLineItems } from "./logBuildAutumnLineItems";

export const buildAutumnLineItems = ({
	ctx,
	newCustomerProducts,
	deletedCustomerProduct,
	billingContext,
	includeArrearLineItems = false,
}: {
	ctx: AutumnContext;
	newCustomerProducts: FullCusProduct[];
	deletedCustomerProduct?: FullCusProduct;
	billingContext: BillingContext;
	includeArrearLineItems?: boolean;
}) => {
	const { logger } = ctx;

	// For now, update subscription doesn't charge for existing usage.
	const { lineItems: arrearLineItems, updateCustomerEntitlements } =
		deletedCustomerProduct && includeArrearLineItems
			? customerProductToArrearLineItems({
					ctx,
					customerProduct: deletedCustomerProduct,
					billingContext,
					options: {
						includePeriodDescription: true,
						updateNextResetAt: true,
					},
				})
			: { lineItems: [], updateCustomerEntitlements: [] };

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
	const allLineItems = [
		...arrearLineItems,
		...deletedLineItems,
		...newLineItems,
	];

	const debugLogs = false;
	if (debugLogs) {
		logBuildAutumnLineItems({
			logger,
			deletedLineItems,
			newLineItems,
		});
	}

	return { allLineItems, updateCustomerEntitlements };
};
