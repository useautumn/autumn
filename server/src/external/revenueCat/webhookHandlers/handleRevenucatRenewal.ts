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
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	// Same active product: pure side-effect (webhook + invoice record). No DB
	// mutation on the cusProduct; the cycle anchor is owned by the app store.
	// Active only — past-due must fall through to the recovery branch below.
	if (curSameProduct && curSameProduct.status === CusProductStatus.Active) {
		logger.info(
			`Renewal for existing active product ${product.id}, sending webhook`,
		);

		await customerProductActions.renew({
			ctx: customerCtx,
			customerProduct: curSameProduct,
			fullCustomer: customer,
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
		appUserId: app_user_id,
	});

	logger.info(`Created RC cus_product for ${product.id} (renewal transition)`);

	await recordRevenueCatInvoice({ ctx: customerCtx, event, customer, product });

	return { success: true };
};
