import {
	cusProductToProduct,
	type FullCustomer,
	isCustomerProductFree,
	isFreeProduct,
	type UpdateSubscriptionBillingContextOverride,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type ReusePricesAndEntitlements,
	setupPatchContext,
} from "@/internal/billing/v2/setup/patch";
import { handleCustomizeUpsertLicenses } from "@/internal/billing/v2/setup/patch/handleCustomizeUpsertLicenses";
import { ProductService } from "@/internal/products/ProductService";
import { setupCustomFullProduct } from "../../../setup/setupCustomFullProduct";
import { setupCustomizeLicenses } from "../../../setup/setupCustomizeLicenses";
import { findTargetCustomerProduct } from "./findTargetCustomerProduct";
import { setupUpdateLicenseQuantities } from "./setupUpdateLicenseQuantities";

export const setupUpdateSubscriptionProductContext = async ({
	ctx,
	fullCustomer,
	params,
	contextOverride = {},
	reusePricesAndEntitlements,
	resetToCatalogVersion = false,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV1Params;
	contextOverride?: UpdateSubscriptionBillingContextOverride;
	reusePricesAndEntitlements?: ReusePricesAndEntitlements;
	resetToCatalogVersion?: boolean;
}) => {
	const { productContext } = contextOverride;

	if (productContext) {
		return {
			customerProduct: productContext.customerProduct,
			fullProduct: productContext.fullProduct,
			customPrices: productContext.customPrices,
			customEnts: productContext.customEnts,
			isUpdatingFreeCustomerProduct:
				isCustomerProductFree(productContext.customerProduct) ||
				isFreeProduct({ product: productContext.fullProduct }),
		};
	}

	const targetCustomerProduct = await findTargetCustomerProduct({
		ctx,
		params,
		fullCustomer,
	});

	let fullProduct = cusProductToProduct({ cusProduct: targetCustomerProduct });
	const requestedVersion = params.version;
	const targetVersion = targetCustomerProduct.product.version;
	const hasRequestedVersion = typeof requestedVersion === "number";
	const changesVersion =
		hasRequestedVersion &&
		(requestedVersion < targetVersion || requestedVersion > targetVersion);
	const shouldLoadCatalogVersion =
		hasRequestedVersion && (resetToCatalogVersion || changesVersion);

	if (shouldLoadCatalogVersion) {
		fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: targetCustomerProduct.product.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: requestedVersion,
		});
	}

	const patchContext = setupPatchContext({
		ctx,
		params,
		customerProduct: targetCustomerProduct,
		fullProduct,
		reusePricesAndEntitlements,
		includeUpsertLicenses: true,
	});

	// Both paths resolve licenses through the same core
	// (setupCustomizeLicenses); they differ in where the result lands —
	// patch converges the existing row's pools, replace plants fresh ones.
	if (patchContext) {
		const { insertPlanLicenses, customerLicenseQuantities } =
			await handleCustomizeUpsertLicenses({
				ctx,
				params,
				patchContext,
				customerProduct: targetCustomerProduct,
			});

		return {
			customerProduct: targetCustomerProduct,
			fullProduct: patchContext.fullProduct,
			patchContext,
			customPrices: [],
			customEnts: [],
			insertPlanLicenses,
			customerLicenseQuantities,
			isUpdatingFreeCustomerProduct:
				isCustomerProductFree(targetCustomerProduct) &&
				isFreeProduct({ product: patchContext.fullProduct }),
		};
	}

	const customProductContext = await setupCustomFullProduct({
		ctx,
		currentFullProduct: fullProduct,
		customizePlan: params.customize,
	});
	const {
		fullProduct: finalFullProduct,
		customPrices,
		customEnts,
		insertPlanLicenses,
	} = await setupCustomizeLicenses({
		ctx,
		customize: params.customize,
		productContext: customProductContext,
	});

	return {
		customerProduct: targetCustomerProduct,
		fullProduct: finalFullProduct,
		patchContext: undefined,
		customPrices,
		customEnts,
		insertPlanLicenses,
		customerLicenseQuantities: setupUpdateLicenseQuantities({
			params,
			fullProduct: finalFullProduct,
			customerProduct: targetCustomerProduct,
		}),
		isUpdatingFreeCustomerProduct:
			isCustomerProductFree(targetCustomerProduct) &&
			isFreeProduct({ product: finalFullProduct }),
	};
};
