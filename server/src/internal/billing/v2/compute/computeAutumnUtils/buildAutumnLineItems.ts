import {
	type BillingContext,
	type FullCusProduct,
	isAllocatedV2CustomerEntitlement,
	type LineItem,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import {
	customerProductToLineItems,
	type LineItemPriceFilters,
} from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { getRefundLineItems } from "@/internal/billing/v2/utils/lineItems/getRefundLineItems";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import { logBuildAutumnLineItems } from "./logBuildAutumnLineItems";

export const buildAutumnLineItems = ({
	ctx,
	newCustomerProducts,
	deletedCustomerProduct,
	deletedCustomerProducts,
	billingContext,
	includeArrearLineItems = false,
	newProductPriceFilters,
}: {
	ctx: AutumnContext;
	newCustomerProducts: FullCusProduct[];
	deletedCustomerProduct?: FullCusProduct;
	deletedCustomerProducts?: FullCusProduct[];
	billingContext: BillingContext;
	includeArrearLineItems?: boolean;
	newProductPriceFilters?: LineItemPriceFilters;
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
				filters: {
					// Allocated v2 holdings are not billed at plan transitions — the
					// carried-over balance is billed at the next cycle end on the new
					// plan instead (billing it here would charge a full cycle of rent
					// mid-cycle and double-bill the carried balance).
					cusEntFilter: (cusEnt) => !isAllocatedV2CustomerEntitlement(cusEnt),
				},
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
		getRefundLineItems({
			ctx,
			customerProduct,
			billingContext,
			priceFilters: { excludeOneOffPrices: true },
		}),
	);

	const newLineItems = newCustomerProducts.flatMap((newCustomerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct: newCustomerProduct,
			billingContext,
			direction: "charge",
			priceFilters: newProductPriceFilters,
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
