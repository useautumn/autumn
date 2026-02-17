import type { AttachParamsV1, BillingContextOverride } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { ProductService } from "@/internal/products/ProductService";
import { setupCustomFullProduct } from "../../../setup/setupCustomFullProduct";

/**
 * Loads the product being attached, handling version and custom items params.
 */
export const setupAttachProductContext = async ({
	ctx,
	params,
	contextOverride = {},
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	contextOverride?: BillingContextOverride;
}) => {
	const { productContext } = contextOverride;
	if (productContext) return productContext;

	const { db, org, env } = ctx;

	// 1. Fetch the product being attached
	const fullProduct = await ProductService.getFull({
		db,
		idOrInternalId: params.plan_id,
		orgId: org.id,
		env,
		version: params.version,
	});

	// 2. Handle custom items if provided
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
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	};
};
