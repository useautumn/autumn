import {
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

export const migrateRevenueCatCustomer = async ({
	req,
	fullCus,
	cusProduct,
	toProduct,
	customerId,
	orgId,
	env,
}: {
	req: ExtendedRequest;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toProduct: FullProduct;
	customerId: string;
	orgId: string;
	env: AppEnv;
}) => {
	const { logger } = req;

	// Debug: Log the old cusProduct dates
	logger.info(`[RC Migration] Old cusProduct dates:`, {
		cusProductId: cusProduct.id,
		created_at: cusProduct.created_at,
		created_at_date: cusProduct.created_at
			? new Date(cusProduct.created_at).toISOString()
			: null,
		starts_at: cusProduct.starts_at,
		starts_at_date: cusProduct.starts_at
			? new Date(cusProduct.starts_at).toISOString()
			: null,
	});

	await CusProductService.update({
		db: req.db,
		cusProductId: cusProduct.id,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: Date.now(),
		},
	});

	const createdAtToPass = cusProduct.created_at;
	const startsAtToPass = cusProduct.starts_at;
	const anchorToPass = cusProduct.created_at;

	// Debug: Log what we're passing to createFullCusProduct
	logger.info(`[RC Migration] Passing to createFullCusProduct:`, {
		createdAt: createdAtToPass,
		createdAt_date: createdAtToPass
			? new Date(createdAtToPass).toISOString()
			: null,
		startsAt: startsAtToPass,
		startsAt_date: startsAtToPass
			? new Date(startsAtToPass).toISOString()
			: null,
		anchorToUnix: anchorToPass,
		anchorToUnix_date: anchorToPass
			? new Date(anchorToPass).toISOString()
			: null,
		createdAt_type: typeof createdAtToPass,
	});

	await createFullCusProduct({
		db: req.db,
		logger: req.logger,
		scenario: AttachScenario.New,
		processorType: ProcessorType.RevenueCat,
		// Preserve the original created_at, starts_at, and billing cycle anchor
		createdAt: createdAtToPass,
		anchorToUnix: anchorToPass,
		carryExistingUsages: true,
		attachParams: attachToInsertParams(
			{
				customer: fullCus,
				products: [toProduct],
				prices: toProduct.prices,
				entitlements: toProduct.entitlements,
				entities: fullCus.entities || [],
				org: req.org,
				stripeCli: createStripeCli({ org: req.org, env: req.env }),
				paymentMethod: null,
				freeTrial: null,
				optionsList: cusProduct.options || [],
				cusProducts: fullCus.customer_products,
				replaceables: [],
				features: req.features,
				fromMigration: true,
			},
			toProduct,
		),
	});

	await deleteCachedApiCustomer({
		customerId,
		orgId,
		env,
	});
};
