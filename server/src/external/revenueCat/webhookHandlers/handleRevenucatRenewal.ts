import type { WebhookRenewal } from "@puzzmo/revenue-cat-webhook-types";
import {
	ACTIVE_STATUSES,
	AttachScenario,
	CusProductStatus,
} from "@shared/index";
import { provisionRevenueCatCusProduct } from "@/external/revenueCat/misc/provisionRevenueCatCusProduct";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import { recordRevenueCatInvoice } from "@/external/revenueCat/utils/recordRevenueCatInvoice";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";

export const handleRenewal = async ({
	event,
	ctx,
}: {
	event: WebhookRenewal;
	ctx: RevenueCatWebhookContext;
}) => {
	const { org, env, logger } = ctx;
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
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	// Same active product: pure side-effect (webhook + invoice record). No DB
	// mutation on the cusProduct; the cycle anchor is owned by the app store.
	if (curSameProduct && ACTIVE_STATUSES.includes(curSameProduct.status)) {
		logger.info(
			`Renewal for existing active product ${product.id}, sending webhook`,
		);

		await addProductsUpdatedWebhookTask({
			ctx: customerCtx,
			internalCustomerId: curSameProduct.internal_customer_id,
			org,
			env,
			customerId: customer.id || "",
			scenario: AttachScenario.Renew,
			cusProduct: curSameProduct,
		});

		await recordRevenueCatInvoice({
			ctx: customerCtx,
			event,
			customer,
			product,
		});

		return { success: true };
	}

	// Past-due → active recovery.
	if (curSameProduct && curSameProduct.status === CusProductStatus.PastDue) {
		logger.info(
			`Renewal for existing past due product ${product.id}, marking as active`,
		);

		await customerProductActions.markActive({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
			sendWebhook: true,
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

	// Reactivate same product (expired/canceled → active).
	if (curSameProduct) {
		await customerProductActions.uncancel({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
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

	// Different product (upgrade or downgrade). V2 attach handles expiring the
	// outgoing cusProduct via computeAttachPlan's transition logic.
	await provisionRevenueCatCusProduct({
		ctx: customerCtx,
		customer,
		product,
	});

	logger.info(`Created RC cus_product for ${product.id} (renewal transition)`);

	await recordRevenueCatInvoice({ ctx: customerCtx, event, customer, product });

	return { success: true };
};
