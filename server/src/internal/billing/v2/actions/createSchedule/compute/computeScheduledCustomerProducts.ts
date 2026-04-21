import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	ScheduledPhaseContext,
} from "@autumn/shared";
import { BillingVersion, CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

const initScheduledCustomerProduct = ({
	ctx,
	billingContext,
	phaseContext,
	productContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	phaseContext: ScheduledPhaseContext;
	productContext: ScheduledPhaseContext["productContexts"][number];
}): FullCusProduct => {
	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer: billingContext.fullCustomer,
			fullProduct: productContext.fullProduct,
			featureQuantities: productContext.featureQuantities,
			resetCycleAnchor: phaseContext.startsAt,
			freeTrial: null,
			now: billingContext.currentEpochMs,
			billingVersion: BillingVersion.V2,
		},
		initOptions: {
			startsAt: phaseContext.startsAt,
			endedAt: phaseContext.endsAt,
			status: CusProductStatus.Scheduled,
		},
	});
};

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
				billingContext,
				phaseContext,
				productContext,
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
