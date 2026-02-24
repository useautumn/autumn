import type { WebhookUnCancellation } from "@puzzmo/revenue-cat-webhook-types";
import {
	CusProductStatus,
	ErrCode,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const handleUncancellation = async ({
	event,
	ctx,
}: {
	event: WebhookUnCancellation;
	ctx: RevenueCatWebhookContext;
}) => {
	const { db } = ctx;
	const { product_id, original_app_user_id, app_user_id } = event;

	const { product, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: original_app_user_id ?? app_user_id,
	});

	const cusProduct = cusProducts.find(
		(cp) =>
			cp.internal_product_id === product.internal_id &&
			cp.processor?.type === ProcessorType.RevenueCat,
	);

	if (cusProduct) {
		await CusProductService.update({
			ctx,
			cusProductId: cusProduct.id,
			updates: {
				canceled_at: null,
				canceled: false,
				ended_at: null,
				status: CusProductStatus.Active,
			},
		});
	} else {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}
};
