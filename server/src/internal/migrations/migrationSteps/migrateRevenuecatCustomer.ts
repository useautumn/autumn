import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

export const migrateRevenueCatCustomer = async ({
	ctx,
	fullCus,
	cusProduct,
	toProduct,
	customerId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toProduct: FullProduct;
	customerId: string;
}) => {
	const { db, logger, org, env, features } = ctx;

	fullCus.customer_products = fullCus.customer_products.filter(
		(cp) => cp.processor?.type === ProcessorType.RevenueCat,
	);

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
		ctx,
		cusProductId: cusProduct.id,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: Date.now(),
		},
	});

	const createdAtToPass = cusProduct.created_at;
	const anchorToPass = cusProduct.created_at;

	await createFullCusProduct({
		db,
		logger,
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
				org,
				stripeCli: createStripeCli({ org, env }),
				paymentMethod: null,
				freeTrial: null,
				optionsList: cusProduct.options || [],
				cusProducts: fullCus.customer_products,
				replaceables: [],
				features,
				fromMigration: true,
			},
			toProduct,
		),
	});

	await deleteCachedApiCustomer({
		customerId,
		ctx,
		source: `migrateRevenueCatCustomer, deleting customer cache`,
	});
};
