import {
	CusProductStatus,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct.js";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { insertCustomItems } from "@/internal/customers/attach/attachUtils/insertCustomItems.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import type { LicenseDefinition } from "../licenseTypes.js";

const resolveLicenseProductForPlan = async ({
	ctx,
	licenseProduct,
	licenseDefinition,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	licenseDefinition: LicenseDefinition;
}) => {
	const customize = licenseDefinition.customize;
	if (!customize) {
		return { licenseProduct, customPrices: [], customEnts: [] };
	}

	const custom = await setupCustomFullProduct({
		ctx,
		currentFullProduct: licenseProduct,
		customizePlan: customize,
	});
	return {
		licenseProduct: custom.fullProduct,
		customPrices: custom.customPrices,
		customEnts: custom.customEnts,
	};
};

export const insertProvisionedLicenseCustomerProduct = async ({
	ctx,
	fullCustomer,
	licenseProduct,
	licenseDefinition,
	internalEntityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	licenseDefinition: LicenseDefinition;
	internalEntityId: string;
}) => {
	const effective = await resolveLicenseProductForPlan({
		ctx,
		licenseProduct,
		licenseDefinition,
	});
	if (effective.customPrices.length > 0 || effective.customEnts.length > 0) {
		await insertCustomItems({
			db: ctx.db,
			customPrices: effective.customPrices,
			customEnts: effective.customEnts,
		});
	}

	const cusProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: effective.licenseProduct,
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
	const pooledFeatureIds = new Set(licenseDefinition.pooled_feature_ids ?? []);
	cusProduct.customer_prices = [];
	cusProduct.subscription_ids = [];
	cusProduct.scheduled_ids = [];
	cusProduct.customer_entitlements = cusProduct.customer_entitlements
		.filter(
			(customerEntitlement) =>
				!pooledFeatureIds.has(customerEntitlement.entitlement.feature.id),
		)
		.map((customerEntitlement) => ({
			...customerEntitlement,
			internal_entity_id: internalEntityId,
		}));

	await CusProductService.insert({ db: ctx.db, data: cusProduct });
	await CusEntService.insert({
		ctx,
		data: cusProduct.customer_entitlements,
	});

	return cusProduct;
};
