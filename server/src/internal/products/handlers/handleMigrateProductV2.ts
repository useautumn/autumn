import {
	BillingType,
	ErrCode,
	MigrateProductParamsSchema,
	ProductNotFoundError,
	RecaseError,
	type UsagePriceConfig,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { MigrationService } from "@/internal/migrations/MigrationService.js";
import { constructMigrationJob } from "@/internal/migrations/migrationUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	getBillingType,
	pricesOnlyOneOff,
} from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { findPrepaidPrice } from "../prices/priceUtils/findPriceUtils.js";

/**
 * Route: POST /v1/products/migrate - Migrate customers between products
 */
export const handleMigrateProductV2 = createRoute({
	body: MigrateProductParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { org, env, db, features } = ctx;
		const { from_product_id, from_version, to_product_id, to_version } = body;

		// Get both products
		const fromProduct = await ProductService.getFull({
			db,
			env,
			orgId: org.id,
			idOrInternalId: from_product_id,
			version: from_version,
		});

		const toProduct = await ProductService.getFull({
			db,
			env,
			orgId: org.id,
			idOrInternalId: to_product_id,
			version: to_version,
		});

		const currentMigrations = await MigrationService.getExistingJobs({
			db,
			orgId: org.id,
			env,
		});

		if (
			currentMigrations.find(
				(m) =>
					m.from_internal_product_id === fromProduct.internal_id &&
					m.to_internal_product_id === toProduct.internal_id,
			)
		) {
			throw new RecaseError({
				message: "Another migration is ongoing, cannot create a new migration",
			});
		}

		if (!fromProduct || !toProduct) {
			throw new ProductNotFoundError({
				productId: !fromProduct ? from_product_id : to_product_id,
				version: !fromProduct ? from_version : to_version,
			});
		}

		// Validate migration compatibility
		if (isFreeProduct(fromProduct.prices) && !isFreeProduct(toProduct.prices)) {
			throw new RecaseError({
				message: "Cannot migrate customers from free product to paid product",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Check if from product is one off, or to product is one off
		if (
			pricesOnlyOneOff(fromProduct.prices) ||
			pricesOnlyOneOff(toProduct.prices)
		) {
			const fromIsOneOff = pricesOnlyOneOff(fromProduct.prices);
			const msg = fromIsOneOff
				? `${fromProduct.name} is a one off product, cannot migrate customers on it`
				: `${toProduct.name} is a one off product, cannot migrate customers to this product`;

			throw new RecaseError({
				message: msg,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Check prepaid price feature compatibility
		for (const price of toProduct.prices) {
			const billingType = getBillingType(price.config);
			if (billingType !== BillingType.UsageInAdvance) continue;

			const config = price.config as UsagePriceConfig;
			const internalFeatureId = config.internal_feature_id;
			const feature = features.find((f) => f.internal_id === internalFeatureId);

			const prepaidPrice = findPrepaidPrice({
				prices: fromProduct.prices,
				internalFeatureId,
			});

			if (!prepaidPrice) {
				throw new RecaseError({
					message: `New product has prepaid price for feature ${feature?.name}, but old product does not, can't perform migration`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		}

		if (!isFreeProduct(fromProduct.prices) && isFreeProduct(toProduct.prices)) {
			throw new RecaseError({
				message: "Cannot migrate customers from paid product to free product",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Create migration job
		const migrationJob = constructMigrationJob({
			fromProduct,
			toProduct,
		});

		ctx.logger.info(`CREATED MIGRATION JOB: ${migrationJob.id}`);

		await MigrationService.createJob({
			db,
			data: migrationJob,
		});

		// Add task to queue for processing

		await addTaskToQueue({
			jobName: JobName.Migration,
			payload: {
				migrationJobId: migrationJob.id,
				orgId: org.id,
				env,
			},
		});

		return c.json(migrationJob);
	},
});
