import {
	CusProductStatus,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import type { LicenseDefinition } from "../../../licenseTypes.js";
import { resolveEffectiveLicenseProduct } from "../../customize/resolveEffectiveLicenseProduct.js";

export const provisionLicenseCustomerProduct = async ({
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
	const customerProduct = initFullCustomerProduct({
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
	customerProduct.license_parent_customer_product_id =
		licenseParentCustomerProductId;
	customerProduct.customer_prices = [];
	customerProduct.subscription_ids = [];
	customerProduct.scheduled_ids = [];
	customerProduct.customer_entitlements =
		customerProduct.customer_entitlements.map((customerEntitlement) => ({
			...customerEntitlement,
			internal_entity_id: internalEntityId,
		}));

	await CusProductService.insert({ db: ctx.db, data: customerProduct });
	await CusEntService.insert({
		ctx,
		data: customerProduct.customer_entitlements,
	});

	return customerProduct;
};
