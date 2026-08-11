import type { WebhookCancellation } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, RecaseError } from "@shared/index";
import {
	emitRevenueCatBillingUpdated,
	snapshotFullCustomer,
} from "@/external/revenueCat/misc/emitRevenueCatBillingUpdated";
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

	const isRefund = isRefundCancellation(event);
	if (isRefund) {
		await refundRevenueCatInvoice({ ctx: customerCtx, event, customer });
	}

	if (!curSameProduct) {
		if (isRefund) {
			logger.info(
				`[handleCancellation] refund cancellation for customer ${customer.id} but no active cus_product to mark cancelled, returning successfully`,
			);
			return;
		}

		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	const originalFullCustomer = snapshotFullCustomer(customer);
	const { updates } = await customerProductActions.cancel({
		ctx: customerCtx,
		customerProduct: curSameProduct,
		fullCustomer: customer,
		endedAt: expiration_at_ms,
	});

	emitRevenueCatBillingUpdated({
		ctx: customerCtx,
		originalFullCustomer,
		updateCustomerProducts: [
			{
				customerProduct: curSameProduct,
				updates,
			},
		],
	});

	logger.info(
		`${isRefund ? "Refund cancellation: marked" : "Marked"} cus_product ${curSameProduct.id} as cancelled, will expire at ${expiration_at_ms}`,
	);
};
