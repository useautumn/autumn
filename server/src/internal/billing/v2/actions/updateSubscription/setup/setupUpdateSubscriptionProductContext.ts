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
import { ProductService } from "@/internal/products/ProductService";
import { setupCustomFullProduct } from "../../../setup/setupCustomFullProduct";
import { findTargetCustomerProduct } from "./findTargetCustomerProduct";

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
				isFreeProduct({ prices: productContext.fullProduct.prices }),
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
	});

	const {
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	} = await setupCustomFullProduct({
		ctx,
		currentFullProduct: fullProduct,
		customizePlan: params.customize,
		patchContext,
	});

	const finalFullProduct = patchContext?.fullProduct ?? customFullProduct;

	const isUpdatingFreeCustomerProduct =
		isCustomerProductFree(targetCustomerProduct) &&
		isFreeProduct({ prices: finalFullProduct.prices });

	return {
		customerProduct: targetCustomerProduct,
		fullProduct: finalFullProduct,
		patchContext,
		customPrices,
		customEnts,
		isUpdatingFreeCustomerProduct,
	};
};
