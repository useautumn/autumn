import type { WebhookUnCancellation } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, ProcessorType, RecaseError } from "@shared/index";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";

export const handleUncancellation = async ({
	event,
	ctx,
}: {
	event: WebhookUnCancellation;
	ctx: RevenueCatWebhookContext;
}) => {
	const { logger } = ctx;
	const { product_id, original_app_user_id, app_user_id } = event;

	const { product, customer, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id ?? original_app_user_id,
	});

	const cusProduct = cusProducts.find(
		(cp) =>
			cp.internal_product_id === product.internal_id &&
			cp.processor?.type === ProcessorType.RevenueCat,
	);

	if (!cusProduct) {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	await customerProductActions.uncancel({
		ctx,
		customerProduct: cusProduct,
		fullCustomer: customer,
	});

	logger.info(`Uncancelled cus_product ${cusProduct.id}`);
};
