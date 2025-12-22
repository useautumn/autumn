import type { WebhookUnCancellation } from "@puzzmo/revenue-cat-webhook-types";
import {
	CusProductStatus,
	ErrCode,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";

export const handleUncancellation = async ({
	event,
	ctx,
}: {
	event: WebhookUnCancellation;
	ctx: AutumnContext;
}) => {
	const { db, org, env } = ctx;
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
			db,
			cusProductId: cusProduct.id,
			updates: {
				canceled_at: null,
				canceled: false,
				ended_at: null,
				status: CusProductStatus.Active,
			},
		});

		await deleteCachedApiCustomer({
			customerId: original_app_user_id ?? app_user_id,
			orgId: org.id,
			env,
		});
	} else {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}
};
