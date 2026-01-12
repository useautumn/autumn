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

/**
 * Schedules a default product for a product group to start at a future time.
 * Used when canceling a subscription to ensure customer has a product after cancellation.
 *
 * @returns The scheduled customer product, or null if no default exists or already scheduled
 */
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
	/** Optional pre-fetched default products to avoid DB call */
	defaultProducts?: FullProduct[];
}): Promise<FullCusProduct | null> => {
	const { db, org, env, logger } = ctx;

	// Fetch default products if not provided
	const defaults =
		defaultProducts ??
		(await ProductService.listDefault({
			db,
			orgId: org.id,
			env,
		}));

	// Find matching default for this group (exclude trial defaults)
	const defaultProduct = defaults.find(
		(product) =>
			product.group === productGroup && !isDefaultTrialFullProduct({ product }),
	);

	if (!defaultProduct) return null;

	// Check if already scheduled for this group
	const alreadyScheduled = fullCustomer.customer_products.some(
		(customerProduct) =>
			customerProduct.product.group === productGroup &&
			customerProduct.status === CusProductStatus.Scheduled,
	);

	if (alreadyScheduled) return null;

	// Create scheduled customer product
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
