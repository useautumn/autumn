import type { WebhookCancellation } from "@puzzmo/revenue-cat-webhook-types";
import {
	type AppEnv,
	ErrCode,
	type Feature,
	type Organization,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { Logger } from "@/external/logtail/logtailUtils";
import { RCMappingService } from "@/external/revenueCat/services/RCMappingService";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { ProductService } from "@/internal/products/ProductService";

export const handleCancellation = async ({
	event,
	db,
	org,
	env,
	logger,
}: {
	event: WebhookCancellation;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	logger: Logger;
	features: Feature[];
}) => {
	const { product_id, original_app_user_id, app_user_id } = event;

	// Look up Autumn product ID from RevenueCat mapping
	const autumnProductId = await RCMappingService.getAutumnProductId({
		db,
		orgId: org.id,
		env,
		revcatProductId: product_id,
	});

	if (!autumnProductId) {
		throw new RecaseError({
			message: `No Autumn product mapped to RevenueCat product: ${product_id}`,
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
		CusService.getFull({
			db,
			idOrInternalId: original_app_user_id ?? app_user_id,
			orgId: org.id,
			env,
		}),
	]);

	if (!product) {
		throw new RecaseError({
			message: "Product not found",
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	if (!customer) {
		throw new RecaseError({
			message: "Customer not found",
			code: ErrCode.CustomerNotFound,
			statusCode: 404,
		});
	}

	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: customer.internal_id,
	});

	const { curSameProduct } = getExistingCusProducts({
		product,
		cusProducts,
		processorType: ProcessorType.RevenueCat,
		internalEntityId: undefined,
	});

	if (!curSameProduct) {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	await CusProductService.update({
		db,
		cusProductId: curSameProduct.id,
		updates: {
			canceled_at: Date.now(),
			ended_at: event.expiration_at_ms,
		},
	});

	logger.info(
		`Marked cus_product ${curSameProduct.id} as cancelled, will expire at ${event.expiration_at_ms}`,
	);

	await deleteCachedApiCustomer({
		customerId: event.original_app_user_id ?? event.app_user_id,
		orgId: org.id,
		env,
	});
};
