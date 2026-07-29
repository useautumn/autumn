import type { WebhookNonRenewingPurchase } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, RecaseError } from "@shared/index";
import {
	getRevenueCatCustomerEmail,
	getRevenueCatCustomerFingerprint,
	getRevenueCatOverrideCustomerId,
} from "@/external/revenueCat/misc/getRevenueCatOverrideCustomerId";
import { provisionRevenueCatCusProduct } from "@/external/revenueCat/misc/provisionRevenueCatCusProduct";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import { recordRevenueCatInvoice } from "@/external/revenueCat/utils/recordRevenueCatInvoice";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { oneOffOrAddOn } from "@/internal/products/productUtils/classifyProduct";

export const handleNonRenewingPurchase = async ({
	event,
	ctx,
}: {
	event: WebhookNonRenewingPurchase;
	ctx: RevenueCatWebhookContext;
}) => {
	const { logger } = ctx;

	const {
		ctx: customerCtx,
		product,
		customer,
		featureQuantities,
	} = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: event.product_id,
		customerId: event.app_user_id,
		originalAppUserId: event.original_app_user_id,
		overrideCustomerId: getRevenueCatOverrideCustomerId(event),
		customerEmail: getRevenueCatCustomerEmail(event),
		customerFingerprint: getRevenueCatCustomerFingerprint(event),
	});

	if (!oneOffOrAddOn({ product })) {
		throw new RecaseError({
			message: "Non-renewing purchase is not a one-off or add-on",
			code: ErrCode.InvalidProductItem,
			statusCode: 400,
		});
	}

	await provisionRevenueCatCusProduct({
		ctx: customerCtx,
		customer,
		product,
		featureQuantities,
		appUserId: event.app_user_id,
	});

	logger.info(`Created RC cus_product for ${product.id} (non-renewing purchase)`);

	await recordRevenueCatInvoice({ ctx: customerCtx, event, customer, product });
};
