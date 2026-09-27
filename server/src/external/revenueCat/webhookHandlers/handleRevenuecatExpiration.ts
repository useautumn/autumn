import type { WebhookExpiration } from "@puzzmo/revenue-cat-webhook-types";
import { ErrCode, RecaseError } from "@shared/index";
import {
	getRevenueCatCustomerEmail,
	getRevenueCatCustomerFingerprint,
	getRevenueCatOverrideCustomerId,
} from "@/external/revenueCat/misc/getRevenueCatOverrideCustomerId";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
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

	if (!curSameProduct) {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	const { activation, insertedCustomerProduct } =
		await customerProductActions.expireAndActivateDefault({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
			updates: {
				ended_at: event.expiration_at_ms,
				canceled: !!curSameProduct.canceled_at,
			},
			emitBillingUpdated: true,
		});
	await applyPooledBalanceCustomerProductTransitions({
		ctx: customerCtx,
		fullCustomer: customer,
		outgoingCustomerProducts: [curSameProduct],
		incomingCustomerProducts: activation
			? [activation.after]
			: insertedCustomerProduct
				? [insertedCustomerProduct]
				: [],
		customerLicenseTransitions: activation?.customerLicenseTransitions,
		now: event.expiration_at_ms,
	});

	logger.info(`Expired cus_product: ${curSameProduct.id}`);
};
