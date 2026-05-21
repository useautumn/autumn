import {
	cusProductToProduct,
	type FullCustomer,
	isCustomerProductFree,
	isFreeProduct,
	notNullish,
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
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV1Params;
	contextOverride?: UpdateSubscriptionBillingContextOverride;
	reusePricesAndEntitlements?: ReusePricesAndEntitlements;
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

	if (
		notNullish(params.version) &&
		params.version !== targetCustomerProduct.product.version
	) {
		fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: targetCustomerProduct.product.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: params.version,
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
