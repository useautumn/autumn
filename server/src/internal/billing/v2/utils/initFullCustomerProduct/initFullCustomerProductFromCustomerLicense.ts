import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerLicense,
	type FullPlanLicense,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "./initFullCustomerProduct";

/** An entity-scoped assignment built from the license's effective product
 * (customize already hydrated onto it), anchored to its pool by link id. */
export const initFullCustomerProductFromCustomerLicense = ({
	ctx,
	fullCustomer,
	customerLicense,
	internalEntityId,
	resetCycleAnchor,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerLicense: FullCustomerLicense & { planLicense: FullPlanLicense };
	internalEntityId: string;
	resetCycleAnchor: number | "now";
	currentEpochMs: number;
}): FullCusProduct =>
	initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: customerLicense.planLicense.product,
			featureQuantities: [],
			resetCycleAnchor,
			freeTrial: null,
			now: currentEpochMs,
		},
		initOptions: {
			internalEntityId,
			status: CusProductStatus.Active,
			// Anchors the assignment to its pool: seats key by link, never repoint.
			customerLicenseLinkId: customerLicense.link_id,
		},
	});
