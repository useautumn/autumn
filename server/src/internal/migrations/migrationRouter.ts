import { BillingType, ErrCode, type UsagePriceConfig } from "@autumn/shared";
import express, { type Router } from "express";
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
import RecaseError from "@/utils/errorUtils.js";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { findPrepaidPrice } from "../products/prices/priceUtils/findPriceUtils.js";

export const migrationRouter: Router = express.Router();

export const handleMigrate = async (
	req: ExtendedRequest,
	res?: ExtendedResponse,
) => {
	const { orgId, env, db, features } = req;

	const { from_product_id, from_version, to_product_id, to_version } = req.body;

	const fromProduct = await ProductService.getFull({
		db,
		env,
		orgId,
		idOrInternalId: from_product_id,
		version: from_version,
	});

	const toProduct = await ProductService.getFull({
		db,
		env,
		orgId,
		idOrInternalId: to_product_id,
		version: to_version,
	});

	if (isFreeProduct(fromProduct.prices) && !isFreeProduct(toProduct.prices)) {
		throw new RecaseError({
			message: `Cannot migrate customers from free product to paid product`,
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

	if (fromProduct.is_add_on || toProduct.is_add_on) {
		throw new RecaseError({
			message: `Cannot migrate customers for add on products`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

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
			message: `Cannot migrate customers from paid product to free product`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (isFreeProduct(fromProduct.prices) && !isFreeProduct(toProduct.prices)) {
		throw new RecaseError({
			message: `Cannot migrate customers from free product to paid product`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 1. Create migration JOB
	const migrationJob = constructMigrationJob({
		fromProduct,
		toProduct,
	});

	await MigrationService.createJob({
		db,
		data: migrationJob,
	});

	if (!fromProduct || !toProduct) {
		throw new RecaseError({
			message: `Product ${from_product_id} version ${from_version} or ${to_product_id} version ${to_version} not found`,
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	await addTaskToQueue({
		jobName: JobName.Migration,
		payload: {
			migrationJobId: migrationJob.id,
		},
	});

	if (res) {
		res.status(200).json(migrationJob);
	}
};

migrationRouter.post("", async (req: any, res: any) => {
	return routeHandler({
		req,
		res,
		action: "migrate",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			await handleMigrate(req, res);
		},
	});
});
