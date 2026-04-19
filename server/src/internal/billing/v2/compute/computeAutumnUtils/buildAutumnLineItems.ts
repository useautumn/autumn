import type {
	BillingContext,
	FullCusProduct,
	LineItem,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { customerProductToLineItems } from "../../utils/lineItems/customerProductToLineItems";
import { logBuildAutumnLineItems } from "./logBuildAutumnLineItems";

export const buildAutumnLineItems = ({
	ctx,
	newCustomerProducts,
	deletedCustomerProduct,
	deletedCustomerProducts,
	billingContext,
	includeArrearLineItems = false,
}: {
	ctx: AutumnContext;
	newCustomerProducts: FullCusProduct[];
	deletedCustomerProduct?: FullCusProduct;
	deletedCustomerProducts?: FullCusProduct[];
	billingContext: BillingContext;
	includeArrearLineItems?: boolean;
}) => {
	const { logger } = ctx;
	const customerProductsToDelete = [
		...(deletedCustomerProduct ? [deletedCustomerProduct] : []),
		...(deletedCustomerProducts ?? []),
	];

	// For now, update subscription doesn't charge for existing usage.
	let arrearLineItems: LineItem[] = [];
	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];
	if (includeArrearLineItems) {
		for (const customerProduct of customerProductsToDelete) {
			const arrearResult = customerProductToArrearLineItems({
				ctx,
				customerProduct,
				billingContext,
				options: {
					includePeriodDescription: true,
					updateNextResetAt: true,
				},
			});
			arrearLineItems.push(...arrearResult.lineItems);
			updateCustomerEntitlements.push(
				...arrearResult.updateCustomerEntitlements,
			);
		}
	}

	arrearLineItems = arrearLineItems.filter((lineItem) => lineItem.amount !== 0);

	// Get line items for ongoing cus product
	const deletedLineItems = customerProductsToDelete.flatMap((customerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct,
			billingContext,
			direction: "refund",
			priceFilters: { excludeOneOffPrices: true },
		}),
	);

	const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct: newCustomerProduct,
			billingContext,
			direction: "charge",
		}),
	);

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
