import {
	CusProductStatus,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct.js";
import { resolveEffectiveLicenseProduct } from "@/internal/licenses/actions/customize/resolveEffectiveLicenseProduct.js";
import type { LicenseDefinition } from "@/internal/licenses/licenseTypes.js";

export const buildLicenseCustomerProduct = async ({
	ctx,
	fullCustomer,
	licenseProduct,
	licenseDefinition,
	internalEntityId,
	licenseParentCustomerProductId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	licenseDefinition: LicenseDefinition;
	internalEntityId: string;
	licenseParentCustomerProductId: string;
}) => {
	const effectiveProduct = await resolveEffectiveLicenseProduct({
		ctx,
		licenseProduct,
		planLicenseId: licenseDefinition.id,
	});

	// Prices are emptied BEFORE init: assignments never bill, and entitlements
	// must not derive usage_allowed from prices the assignment doesn't carry.
	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: { ...effectiveProduct, prices: [] },
			featureQuantities: [],
			resetCycleAnchor: Date.now(),
			freeTrial: null,
			now: Date.now(),
		},
		initOptions: {
			internalEntityId,
			status: CusProductStatus.Active,
			licenseParentCustomerProductId,
		},
	});
};
