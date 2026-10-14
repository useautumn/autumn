import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct";
import { productToInsertParams } from "@/internal/customers/attach/attachUtils/attachParams/convertToParams";
import { ProductService } from "@/internal/products/ProductService";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct";

export const scheduleDefaultProduct = async ({
	ctx,
	productGroup,
	fullCustomer,
	scheduleAtMs,
	defaultProducts,
}: {
	ctx: AutumnContext;
	productGroup: string;
	fullCustomer: FullCustomer;
	scheduleAtMs: number;
	defaultProducts?: FullProduct[];
}): Promise<FullCusProduct | null> => {
	const { db, org, env, logger } = ctx;

	const defaults =
		defaultProducts ??
		(await ProductService.listDefault({
			db,
			orgId: org.id,
			env,
		}));

	const defaultProduct = defaults.find(
		(product) =>
			product.group === productGroup && !isDefaultTrialFullProduct({ product }),
	);

	if (!defaultProduct) return null;

	const alreadyScheduled = fullCustomer.customer_products.some(
		(customerProduct) =>
			customerProduct.product.group === productGroup &&
			customerProduct.status === CusProductStatus.Scheduled,
	);

	if (alreadyScheduled) return null;

	const insertParams = productToInsertParams({
		ctx,
		fullCus: fullCustomer,
		newProduct: defaultProduct,
		entities: fullCustomer.entities,
	});

	const scheduledProduct = await createFullCusProduct({
		db,
		attachParams: insertParams,
		startsAt: scheduleAtMs,
		sendWebhook: false,
		logger,
	});

	if (scheduledProduct) {
		logger.info(
			`[scheduleDefaultProduct] Scheduled ${defaultProduct.name} for ${new Date(scheduleAtMs).toISOString()}`,
		);
	}

	return scheduledProduct ?? null;
};
