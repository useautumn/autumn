import type { WebhookProductChange } from "@puzzmo/revenue-cat-webhook-types";
import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	ProcessorType,
} from "@shared/index";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { setRevenueCatLogContext } from "@/external/revenueCat/misc/revenueCatLogContext";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

// Absorbs clock skew and delivery jitter between RevenueCat ending the purchase and this webhook.
const ENDED_TOLERANCE_MS = 10 * 60 * 1000;

const comesFromPurchase = ({
	cusProduct,
	originalTransactionId,
}: {
	cusProduct: FullCusProduct;
	originalTransactionId: string;
}) => {
	const stored = cusProduct.processor?.original_transaction_id;
	return stored ? stored === originalTransactionId : true;
};

const isReplacedRevenueCatPlan = ({
	cusProduct,
	autumnProductId,
	originalTransactionId,
}: {
	cusProduct: FullCusProduct;
	autumnProductId: string;
	originalTransactionId: string;
}) =>
	cusProduct.processor?.type === ProcessorType.RevenueCat &&
	cusProduct.product.id === autumnProductId &&
	customerProductHasActiveStatus(cusProduct) &&
	comesFromPurchase({ cusProduct, originalTransactionId });

/**
 * Expires the plan granted by the replaced subscription once it has ended. The holder is found through the
 * purchase's invoice, since the replacement may come from another app user (e.g. a Google Play account switch).
 */
export const handleProductChange = async ({
	event,
	ctx,
}: {
	event: WebhookProductChange;
	ctx: RevenueCatWebhookContext;
}) => {
	const { db, org, env } = ctx;
	const { product_id, original_transaction_id, expiration_at_ms } = event;

	const skip = (reason: string) => {
		ctx.logger
			.child({
				context: {
					extras: { rc_product_change: true, outcome: "noop", reason },
				},
			})
			.info(`[handleProductChange] no-op: ${reason}`);
		return { success: true };
	};

	// Deferred changes (e.g. App Store downgrades) end later and arrive as RENEWAL / EXPIRATION.
	if (!expiration_at_ms || expiration_at_ms > Date.now() + ENDED_TOLERANCE_MS)
		return skip("replaced subscription has not ended yet");
	if (!original_transaction_id) return skip("no original_transaction_id");

	const mapping = await RCMappingService.resolveMapping({
		db,
		orgId: org.id,
		env,
		revenuecatProductId: product_id,
	});
	if (!mapping?.autumnProductId) return skip("replaced product is not mapped");

	const invoice = await InvoiceService.getByStripeId({
		db,
		stripeId: original_transaction_id,
	});
	if (invoice?.processor_type !== ProcessorType.RevenueCat)
		return skip("no RevenueCat invoice for the replaced purchase");

	const holder = await CusService.getFull({
		ctx,
		idOrInternalId: invoice.internal_customer_id,
		withEntities: true,
		withSubs: true,
		allowNotFound: true,
	});
	if (!holder) return skip("purchase holder not found in this org/env");

	const replacedCusProduct = holder.customer_products.find((cusProduct) =>
		isReplacedRevenueCatPlan({
			cusProduct,
			autumnProductId: mapping.autumnProductId,
			originalTransactionId: original_transaction_id,
		}),
	);
	if (!replacedCusProduct)
		return skip("holder has no active plan for the replaced product");

	ctx.customerId = holder.id ?? "";
	setRevenueCatLogContext({ ctx, customerId: ctx.customerId });
	const { ctx: holderCtx } = getCtxWithCustomerRedis({
		ctx,
		customerId: ctx.customerId,
	});

	await customerProductActions.expireAndActivateDefault({
		ctx: holderCtx,
		customerProduct: replacedCusProduct,
		fullCustomer: holder,
		updates: {
			ended_at: expiration_at_ms,
			canceled: !!replacedCusProduct.canceled_at,
		},
		emitBillingUpdated: true,
	});

	ctx.logger
		.child({
			context: {
				extras: {
					rc_product_change: true,
					outcome: "expired",
					holder_customer_id: holder.id ?? holder.internal_id,
					cus_product_id: replacedCusProduct.id,
					event_app_user_id: event.app_user_id,
				},
			},
		})
		.info(
			`[handleProductChange] expired replaced cus_product ${replacedCusProduct.id}`,
		);

	return { success: true };
};
