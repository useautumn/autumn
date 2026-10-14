import type { WebhookRenewal } from "@puzzmo/revenue-cat-webhook-types";
import { CusProductStatus } from "@shared/index";
import {
	getRevenueCatCustomerEmail,
	getRevenueCatCustomerFingerprint,
	getRevenueCatOverrideCustomerId,
} from "@/external/revenueCat/misc/getRevenueCatOverrideCustomerId";
import { provisionRevenueCatCusProduct } from "@/external/revenueCat/misc/provisionRevenueCatCusProduct";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import { recordRevenueCatInvoice } from "@/external/revenueCat/utils/recordRevenueCatInvoice";
import { storeRevenueCatPeriod } from "@/external/revenueCat/utils/revenueCatPeriod";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";

export const handleRenewal = async ({
	event,
	ctx,
}: {
	event: WebhookRenewal;
	ctx: RevenueCatWebhookContext;
}) => {
	const { logger } = ctx;
	const { product_id, app_user_id, original_app_user_id } = event;

	const {
		ctx: customerCtx,
		product,
		customer,
		cusProducts,
	} = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id,
		originalAppUserId: original_app_user_id,
		overrideCustomerId: getRevenueCatOverrideCustomerId(event),
		customerEmail: getRevenueCatCustomerEmail(event),
		customerFingerprint: getRevenueCatCustomerFingerprint(event),
		autoCreateCustomer: true,
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	if (curSameProduct && curSameProduct.status === CusProductStatus.Active) {
		logger.info(
			`Renewal for existing active product ${product.id}, sending webhook`,
		);

		const updates = await storeRevenueCatPeriod({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			event,
		});

		await customerProductActions.renew({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
			updates,
		});

		await recordRevenueCatInvoice({
			ctx: customerCtx,
			event,
			customer,
			product,
		});

		return { success: true };
	}

	if (curSameProduct && curSameProduct.status === CusProductStatus.PastDue) {
		logger.info(
			`Renewal for existing past due product ${product.id}, marking as active`,
		);

		const recoverPastDueProduct = curSameProduct.canceled
			? customerProductActions.uncancel
			: customerProductActions.markActive;

		await recoverPastDueProduct({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
		});

		await storeRevenueCatPeriod({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			event,
		});

		logger.info(`Marked past due product as active: ${curSameProduct.id}`);

		await recordRevenueCatInvoice({
			ctx: customerCtx,
			event,
			customer,
			product,
		});

		return { success: true };
	}

	if (curSameProduct) {
		await customerProductActions.uncancel({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
		});

		await storeRevenueCatPeriod({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			event,
		});

		logger.info(`Reactivated cus_product: ${curSameProduct.id}`);

		await recordRevenueCatInvoice({
			ctx: customerCtx,
			event,
			customer,
			product,
		});

		return { success: true };
	}

	await provisionRevenueCatCusProduct({
		ctx: customerCtx,
		customer,
		product,
		appUserId: app_user_id,
		periodEvent: event,
		originalTransactionId: event.original_transaction_id,
	});

	logger.info(`Created RC cus_product for ${product.id} (renewal transition)`);

	await recordRevenueCatInvoice({ ctx: customerCtx, event, customer, product });

	return { success: true };
};
