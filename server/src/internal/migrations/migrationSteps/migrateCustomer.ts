import {
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	type Feature,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	type MigrationJob,
	type Organization,
	ProcessorType,
} from "@autumn/shared";
import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { Logger } from "../../../external/logtail/logtailUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { deleteCachedApiCustomer } from "../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { migrationToAttachParams } from "../migrationUtils/migrationToAttachParams.js";
import { runMigrationAttach } from "../migrationUtils/runMigrationAttach.js";

export const migrateCustomer = async ({
	db,
	customerId,
	org,
	logger,
	env,
	orgId,
	fromProduct,
	toProduct,
	features,
	migrationJob,
}: {
	db: DrizzleCli;
	customerId: string;
	org: Organization;
	env: AppEnv;
	orgId: string;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	logger: Logger;
	features: Feature[];
	migrationJob?: MigrationJob;
}) => {
	try {
		const stripeCli = createStripeCli({ org, env });
		const fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId,
			env,
			withEntities: true,
		});

		// 1. Build req object
		const req = {
			db,
			orgId,
			env,
			org,
			features,
			logger,
			timestamp: Date.now(),
		} as ExtendedRequest;

		const cusProducts = fullCus.customer_products;
		const filteredCusProducts = cusProducts.filter(
			(cp: FullCusProduct) =>
				cp.product.internal_id === fromProduct.internal_id,
		);

		for (const cusProduct of filteredCusProducts) {
			if (cusProduct.processor?.type === ProcessorType.RevenueCat) {
				await migrateRevenueCatCustomer({
					req,
					fullCus,
					cusProduct,
					toProduct,
					customerId,
					orgId,
					env,
				});
			} else {
				await migrateStripeCustomer({
					req,
					stripeCli,
					fullCus,
					cusProduct,
					toProduct,
					fromProduct,
					customerId,
					orgId,
					env,
				});
			}
		}

		return true;
	} catch (error: any) {
		logger.error(
			`Migration failed for customer ${customerId}, job id: ${migrationJob?.id}`,
		);
		logger.error(error);

		return false;
	}
};

export const migrateStripeCustomer = async ({
	req,
	stripeCli,
	fullCus,
	cusProduct,
	toProduct,
	fromProduct,
	customerId,
	orgId,
	env,
}: {
	req: ExtendedRequest;
	stripeCli: Stripe;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toProduct: FullProduct;
	fromProduct: FullProduct;
	customerId: string;
	orgId: string;
	env: AppEnv;
}) => {
	const attachParams = await migrationToAttachParams({
		req,
		stripeCli,
		customer: fullCus,
		cusProduct,
		newProduct: toProduct,
	});

	await runMigrationAttach({
		ctx: req as unknown as AutumnContext,
		attachParams,
		fromProduct,
	});

	await deleteCachedApiCustomer({
		customerId,
		orgId,
		env,
	});
};

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
		externalSubIds: [
			{
				type: ProcessorType.RevenueCat,
				id: cusProduct.external_sub_ids?.[0]?.id ?? "",
			},
		],
		// Preserve the original created_at, starts_at, and billing cycle anchor
		createdAt: createdAtToPass,
		startsAt: startsAtToPass,
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
