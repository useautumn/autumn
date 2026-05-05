import {
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { ProductService } from "@/internal/products/ProductService";
import { getOrCreateCustomer } from "../../../internal/customers/cusUtils/getOrCreateCustomer";

/**
 * Resolves a RevenueCat product ID to an Autumn product and fetches the customer.
 * Also sets ctx.customerId for cache invalidation by the refresh middleware.
 * Throws if product mapping, product, customer is not found, or customer has non-RevenueCat products.
 */
export const resolveRevenuecatResources = async ({
	ctx,
	revenuecatProductId,
	customerId,
	autoCreateCustomer = false,
}: {
	ctx: RevenueCatWebhookContext;
	revenuecatProductId: string;
	customerId: string;
	autoCreateCustomer?: boolean;
}): Promise<{
	product: FullProduct;
	customer: FullCustomer;
	cusProducts: FullCusProduct[];
}> => {
	const { db, org, env } = ctx;

	// Look up Autumn product ID from RevenueCat mapping
	const autumnProductId = await RCMappingService.getAutumnProductId({
		db,
		orgId: org.id,
		env,
		revenuecatProductId,
	});

	if (!autumnProductId) {
		throw new RecaseError({
			message: `No Autumn product mapped to RevenueCat product: ${revenuecatProductId}`,
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	const [product, customer] = await Promise.all([
		ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: autumnProductId,
		}),
		autoCreateCustomer
			? getOrCreateCustomer({
					ctx,
					customerId,
				})
			: CusService.getFull({
					ctx,
					idOrInternalId: customerId,
				}),
	]);

	// If the customer has a product from a different processor than RevenueCat and it has no subscriptions, throw an error.
	//
	// Exception: true one-off purchases (no recurring intervals) are safe to mix
	// across processors because they create a parallel cus_product without
	// replacing the customer's existing subscription. This lets a Stripe-subscribed
	// customer buy a one-off pack via RevenueCat (and vice versa).
	const incomingIsOneOff = pricesOnlyOneOff(product.prices);

	if (
		!incomingIsOneOff &&
		customer.customer_products.some(
			(cp) =>
				cp.processor?.type !== ProcessorType.RevenueCat &&
				(cp.subscription_ids?.length ?? 0) !== 0,
		)
	) {
		throw new RecaseError({
			message:
				"Customer already has a product from a different processor than RevenueCat.",
		});
	}

	const cusProducts = customer.customer_products.filter(
		(cp) =>
			cp.processor?.type === ProcessorType.RevenueCat || cp.product.is_default,
	);

	ctx.customerId = customer.id ?? "";
	ctx.rolloutSnapshot = computeRolloutSnapshot({
		orgId: ctx.org.id,
		customerId: ctx.customerId,
	});

	return { product, customer, cusProducts };
};
