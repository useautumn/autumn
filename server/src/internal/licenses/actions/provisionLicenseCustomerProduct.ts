import {
	type DbPlanLicense,
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

const resolveLicenseProductForPlan = async ({
	ctx,
	licenseProduct,
	planLicense,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	planLicense: DbPlanLicense;
}) => {
	const customize = planLicense.customize;
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
	planLicense,
	internalEntityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	planLicense: DbPlanLicense;
	internalEntityId: string;
}) => {
	const effective = await resolveLicenseProductForPlan({
		ctx,
		licenseProduct,
		planLicense,
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
	cusProduct.customer_prices = [];
	cusProduct.subscription_ids = [];
	cusProduct.scheduled_ids = [];
	cusProduct.customer_entitlements = cusProduct.customer_entitlements.map(
		(entitlement) => ({
			...entitlement,
			internal_entity_id: internalEntityId,
		}),
	);

	await CusProductService.insert({ db: ctx.db, data: cusProduct });
	await CusEntService.insert({
		ctx,
		data: cusProduct.customer_entitlements,
	});

	return cusProduct;
};
