import {
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { getOrCreateCustomer } from "../../../internal/customers/cusUtils/getOrCreateCustomer";

/**
 * Resolves a RevenueCat product ID to an Autumn product and fetches the customer.
 * Throws if product mapping, product, customer is not found, or customer has non-RevenueCat products.
 */
export const resolveRevenuecatResources = async ({
	ctx,
	revenuecatProductId,
	customerId,
	autoCreateCustomer = false,
}: {
	ctx: AutumnContext;
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
				db,
				idOrInternalId: customerId,
				orgId: org.id,
				env,
			}),
	]);

	// If the customer has a product from a different processor than RevenueCat and it has no subscriptions, throw an error
	if (
		customer.customer_products.some(
			(cp) =>
				cp.processor?.type !== ProcessorType.RevenueCat &&
				((cp.subscription_ids?.length ?? 0) !== 0),
		)
	) {
		throw new RecaseError({
			message:
				"Customer already has a product from a different processor than RevenueCat.",
		});
	}

	const cusProducts = customer.customer_products.filter(
		(cp) => cp.processor?.type === ProcessorType.RevenueCat,
	);

	return { product, customer, cusProducts };
};
