import type { WebhookExpiration } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, RecaseError } from "@shared/index";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";

export const handleExpiration = async ({
	event,
	ctx,
}: {
	event: WebhookExpiration;
	ctx: RevenueCatWebhookContext;
}) => {
	const { logger } = ctx;
	const { product_id, original_app_user_id, app_user_id } = event;

	const { product, customer, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id ?? original_app_user_id,
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

	await customerProductActions.expireAndActivateDefault({
		ctx,
		customerProduct: curSameProduct,
		fullCustomer: customer,
	});

	logger.info(`Expired cus_product: ${curSameProduct.id}`);
};
