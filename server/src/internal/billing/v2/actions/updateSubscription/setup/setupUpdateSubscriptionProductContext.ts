import {
	cusProductToProduct,
	type FullCustomer,
	notNullish,
	RecaseError,
	type UpdateSubscriptionBillingContextOverride,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";
import { setupCustomFullProduct } from "../../../setup/setupCustomFullProduct";
import { findTargetCustomerProduct } from "./findTargetCustomerProduct";

export const setupUpdateSubscriptionProductContext = async ({
	ctx,
	fullCustomer,
	params,
	contextOverride = {},
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV1Params;
	contextOverride?: UpdateSubscriptionBillingContextOverride;
}) => {
	const { productContext } = contextOverride;

	if (productContext) return productContext;

	const targetCustomerProduct = findTargetCustomerProduct({
		params,
		fullCustomer,
	});

	if (!targetCustomerProduct) {
		throw new RecaseError({
			message: `Customer ${fullCustomer.id} does not have the product ${params.product_id}.`,
		});
	}

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

	const {
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	} = await setupCustomFullProduct({
		ctx,
		currentFullProduct: fullProduct,
		customizePlan: params.customize,
	});

	return {
		customerProduct: targetCustomerProduct,
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	};
};
