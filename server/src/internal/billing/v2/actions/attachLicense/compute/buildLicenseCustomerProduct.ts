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

	// Prices are emptied BEFORE init so assignment entitlements never derive
	// usage_allowed from them — overage must fall through to the carrier.
	const base = initFullCustomerProduct({
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
		},
	});

	// The builder leaves cusEnt entity ids null; assignment balances are
	// entity-scoped, so stamp them to match the assignment's entity.
	const customerProduct = {
		...base,
		license_parent_customer_product_id: licenseParentCustomerProductId,
		customer_entitlements: base.customer_entitlements.map(
			(customerEntitlement) => ({
				...customerEntitlement,
				internal_entity_id: internalEntityId,
			}),
		),
	};

	return customerProduct;
};
