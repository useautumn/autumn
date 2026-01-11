import type { WebhookExpiration } from "@puzzmo/revenue-cat-webhook-types";
import { CusProductStatus, ErrCode, RecaseError } from "@shared/index";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { activateDefaultProduct } from "@/internal/customers/cusProducts/cusProductUtils";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { isOneOff } from "@/internal/products/productUtils";

export const handleExpiration = async ({
	event,
	ctx,
}: {
	event: WebhookExpiration;
	ctx: RevenueCatWebhookContext;
}) => {
	const { db, logger } = ctx;
	const { product_id, original_app_user_id, app_user_id } = event;

	const { product, customer, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: original_app_user_id ?? app_user_id,
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	if (!curSameProduct) {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	// Expire the cus_product
	await CusProductService.update({
		db,
		cusProductId: curSameProduct.id,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: event.expiration_at_ms,
			canceled: !!curSameProduct.canceled_at,
		},
	});

	logger.info(`Expired cus_product: ${curSameProduct.id}`);

	// Activate default product if this was a main product
	const isMain = !product.is_add_on;
	const isOneOffProduct = isOneOff(product.prices);

	if (isMain && !isOneOffProduct) {
		await activateDefaultProduct({
			ctx,
			productGroup: product.group,
			fullCus: customer,
			curCusProduct: curSameProduct,
		});
	}
};
