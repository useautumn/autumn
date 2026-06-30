import type { WebhookInitialPurchase } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, RecaseError } from "@shared/index";
import { provisionRevenueCatCusProduct } from "@/external/revenueCat/misc/provisionRevenueCatCusProduct";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import { recordRevenueCatInvoice } from "@/external/revenueCat/utils/recordRevenueCatInvoice";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";

export const handleInitialPurchase = async ({
	event,
	ctx,
}: {
	event: WebhookInitialPurchase;
	ctx: RevenueCatWebhookContext;
}) => {
	const { logger } = ctx;
	const { product_id, app_user_id } = event;

	const {
		ctx: customerCtx,
		product,
		customer,
		cusProducts,
		featureQuantities,
	} = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id,
		autoCreateCustomer: true,
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	// Guard the same-product attach explicitly so RC consumers get the canonical
	// CustomerAlreadyHasProduct error rather than V2 attach's PlanAlreadyAttached.
	if (curSameProduct) {
		throw new RecaseError({
			message: `[handleInitialPurchase] Customer ${customer.id} already has product ${product.id}`,
			code: ErrCode.CustomerAlreadyHasProduct,
			statusCode: 400,
		});
	}

	await provisionRevenueCatCusProduct({
		ctx: customerCtx,
		customer,
		product,
		featureQuantities,
	});

	logger.info(`Created RC cus_product for ${product.id} (initial purchase)`);

	await recordRevenueCatInvoice({ ctx: customerCtx, event, customer, product });
};
