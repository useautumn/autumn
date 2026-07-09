import type { WebhookCancellation } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, RecaseError } from "@shared/index";
import {
	getRevenueCatCustomerEmail,
	getRevenueCatCustomerFingerprint,
	getRevenueCatOverrideCustomerId,
} from "@/external/revenueCat/misc/getRevenueCatOverrideCustomerId";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import { refundRevenueCatInvoice } from "@/external/revenueCat/utils/refundRevenueCatInvoice";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";

const isRefundCancellation = (event: WebhookCancellation): boolean => {
	if (event.cancel_reason === "CUSTOMER_SUPPORT") return true;
	if (typeof event.price === "number" && event.price < 0) return true;
	return false;
};

export const handleCancellation = async ({
	event,
	ctx,
}: {
	event: WebhookCancellation;
	ctx: RevenueCatWebhookContext;
}) => {
	const { logger } = ctx;
	const { product_id, original_app_user_id, app_user_id, expiration_at_ms } =
		event;

	const {
		ctx: customerCtx,
		product,
		customer,
		cusProducts,
	} = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id ?? original_app_user_id,
		originalAppUserId: original_app_user_id,
		overrideCustomerId: getRevenueCatOverrideCustomerId(event),
		customerEmail: getRevenueCatCustomerEmail(event),
		customerFingerprint: getRevenueCatCustomerFingerprint(event),
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	if (isRefundCancellation(event)) {
		await refundRevenueCatInvoice({ ctx: customerCtx, event, customer });

		if (!curSameProduct) {
			logger.info(
				`[handleCancellation] refund cancellation for customer ${customer.id} but no active cus_product to mark cancelled, returning successfully`,
			);
			return;
		}

		await customerProductActions.cancel({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
			endedAt: expiration_at_ms,
		});

		logger.info(
			`Refund cancellation: marked cus_product ${curSameProduct.id} cancelled, expires at ${expiration_at_ms}`,
		);
		return;
	}

	if (!curSameProduct) {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	await customerProductActions.cancel({
		ctx: customerCtx,
		customerProduct: curSameProduct,
		fullCustomer: customer,
		endedAt: expiration_at_ms,
	});

	logger.info(
		`Marked cus_product ${curSameProduct.id} as cancelled, will expire at ${expiration_at_ms}`,
	);
};
