import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerLicense,
	type FullPlanLicense,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "./initFullCustomerProduct";

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
			customerLicenseLinkId: customerLicense.link_id,
		},
	});
