import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";

/** Build scheduled customer products to insert and existing ones to delete. */
export const computeScheduledCustomerProducts = ({
	ctx,
	billingContext,
	existingScheduledCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	existingScheduledCustomerProducts: FullCusProduct[];
}) => {
	const insertCustomerProducts: FullCusProduct[] = [];
	const customPrices = [];
	const customEntitlements = [];
	const scheduledPhases: { startsAt: number; customerProductIds: string[] }[] =
		[];

	for (const phaseContext of billingContext.scheduledPhaseContexts) {
		const phaseCustomerProductIds: string[] = [];

		for (const productContext of phaseContext.productContexts) {
			const customerProduct = initScheduledCustomerProduct({
				ctx,
				fullCustomer: billingContext.fullCustomer,
				fullProduct: productContext.fullProduct,
				featureQuantities: productContext.featureQuantities,
				startsAt: phaseContext.startsAt,
				endsAt: phaseContext.endsAt,
				currentEpochMs: billingContext.currentEpochMs,
			});
			insertCustomerProducts.push(customerProduct);
			phaseCustomerProductIds.push(customerProduct.id);
			customPrices.push(...productContext.customPrices);
			customEntitlements.push(...productContext.customEntitlements);
		}

		scheduledPhases.push({
			startsAt: phaseContext.startsAt,
			customerProductIds: phaseCustomerProductIds,
		});
	}

	return {
		insertCustomerProducts,
		deleteCustomerProducts: existingScheduledCustomerProducts,
		customPrices,
		customEntitlements,
		scheduledPhases,
	};
};
