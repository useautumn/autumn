import type { WebhookExpiration } from "@puzzmo/revenue-cat-webhook-types";
import {
	type AppEnv,
	CusProductStatus,
	ErrCode,
	type Feature,
	type Organization,
	RecaseError,
} from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { Logger } from "@/external/logtail/logtailUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { activateDefaultProduct } from "@/internal/customers/cusProducts/cusProductUtils";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { isOneOff } from "@/internal/products/productUtils";
import { ProductService } from "@/internal/products/ProductService";

export const handleExpiration = async ({
	event,
	db,
	org,
	env,
	logger,
	features,
	ctx,
}: {
	event: WebhookExpiration;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	logger: Logger;
	features: Feature[];
	ctx: AutumnContext;
}) => {
	const { product_id, original_app_user_id, app_user_id } = event;

	const [product, customer] = await Promise.all([
		ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: product_id,
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
		internalEntityId: undefined,
	});

	if (!curSameProduct) {
		throw new RecaseError({
			message: "Cus product not found",
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	// Expire the cus_product
	await CusProductService.update({
		db,
		cusProductId: curSameProduct.id,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: event.expiration_at_ms,
			canceled: !!curSameProduct.canceled_at,
		},
	});

	logger.info(`Expired cus_product: ${curSameProduct.id}`);

	// Activate default product if this was a main product
	const isMain = !product.is_add_on;
	const isOneOffProduct = isOneOff(product.prices);

	if (isMain && !isOneOffProduct) {
		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customer.internal_id,
			orgId: org.id,
			env,
		});

		if (fullCus) {
			await activateDefaultProduct({
				ctx,
				productGroup: product.group,
				fullCus,
				curCusProduct: curSameProduct,
			});

			logger.info(
				`Attempted to activate default product for group: ${product.group}`,
			);
		}
	}

	await deleteCachedApiCustomer({
		customerId: event.original_app_user_id ?? event.app_user_id,
		orgId: org.id,
		env,
	});
};
