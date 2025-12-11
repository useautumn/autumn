import type { WebhookUnCancellation } from "@puzzmo/revenue-cat-webhook-types";
import {
	type AppEnv,
	CusProductStatus,
	ErrCode,
	type Organization,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import { RCMappingService } from "@/external/revenueCat/services/RCMappingService";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { ProductService } from "@/internal/products/ProductService";

export const handleUncancellation = async ({
	event,
	db,
	org,
	env,
}: {
	event: WebhookUnCancellation;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
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

	if (
		cusProducts.some((cp) => cp.processor?.type !== ProcessorType.RevenueCat)
	) {
		throw new RecaseError({
			message: "Customer already has a product from a different processor.",
			code: ErrCode.CustomerAlreadyHasProduct,
			statusCode: 400,
		});
	}

	const cusProduct = cusProducts.find(
		(cp) =>
			cp.internal_product_id === product.internal_id &&
			cp.processor?.type === ProcessorType.RevenueCat,
	);

	if (cusProduct) {
		await CusProductService.update({
			db,
			cusProductId: cusProduct.id,
			updates: {
				canceled_at: null,
				canceled: false,
				ended_at: null,
				status: CusProductStatus.Active,
			},
		});

		await deleteCachedApiCustomer({
			customerId: event.original_app_user_id ?? event.app_user_id,
			orgId: org.id,
			env,
		});
	} else {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}
};
