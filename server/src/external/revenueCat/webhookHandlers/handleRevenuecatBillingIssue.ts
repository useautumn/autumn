import type { WebhookBillingIssue } from "@puzzmo/revenue-cat-webhook-types";
import { RecaseError } from "@shared/api/errors/base/RecaseError";
import { ErrCode } from "@shared/enums/ErrCode";
import { CusProductStatus } from "@shared/models/cusProductModels/cusProductEnums";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import {
	ACTIVE_STATUSES,
	CusProductService,
} from "@/internal/customers/cusProducts/CusProductService";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { resolveRevenuecatResources } from "../misc/resolveRevenuecatResources";

export const handleBillingIssue = async ({
	event,
	ctx,
}: {
	event: WebhookBillingIssue;
	ctx: RevenueCatWebhookContext;
}) => {
	const { db, logger } = ctx;
	const { product_id, app_user_id } = event;

	const { product, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id,
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

	if (curSameProduct.status === CusProductStatus.PastDue) {
		logger.info(
			`Billing issue for existing past due product ${product.id}, no action needed`,
		);
		return { success: true };
	}

	if (ACTIVE_STATUSES.includes(curSameProduct.status)) {
		await CusProductService.update({
			ctx,
			cusProductId: curSameProduct.id,
			updates: {
				status: CusProductStatus.PastDue,
			},
		});

		return { success: true };
	}

	throw new RecaseError({
		message: "Cus product is not in a valid status to be billed",
		code: ErrCode.NoActiveCusProducts,
		statusCode: 400,
	});
};
