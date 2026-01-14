import {
	cusProductToProduct,
	type FullCustomer,
	InternalError,
	notNullish,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";
import { setupCustomFullProduct } from "../../setup/setupCustomFullProduct";
import { findTargetCustomerProduct } from "./findTargetCustomerProduct";

export const setupUpdateSubscriptionProductContext = async ({
	ctx,
	fullCustomer,
	params,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	params: UpdateSubscriptionV0Params;
}) => {
	const targetCustomerProduct = findTargetCustomerProduct({
		params,
		fullCustomer,
	});

	if (!targetCustomerProduct) {
		throw new InternalError({
			message: `[API Subscription Update] Target customer product not found: ${params.product_id}`,
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
		customItems: params.items,
	});

	return {
		customerProduct: targetCustomerProduct,
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	};
};
