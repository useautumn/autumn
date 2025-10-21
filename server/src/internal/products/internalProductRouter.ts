import { type FeatureOptions, UsageModel } from "@autumn/shared";
import { Router } from "express";
import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { CusProdReadService } from "../customers/cusProducts/CusProdReadService.js";
import { FeatureService } from "../features/FeatureService.js";
import { MigrationService } from "../migrations/MigrationService.js";
import { OrgService } from "../orgs/OrgService.js";
import { createOrgResponse } from "../orgs/orgUtils.js";
import { RewardProgramService } from "../rewards/RewardProgramService.js";
import { RewardService } from "../rewards/RewardService.js";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import { handleGetProductDeleteInfo } from "./handlers/handleGetProductDeleteInfo.js";
import { ProductService } from "./ProductService.js";
import { isFeaturePriceItem } from "./product-items/productItemUtils/getItemType.js";
import { sortFullProducts } from "./productUtils/sortProductUtils.js";
import {
	getGroupToDefaults,
	getLatestProducts,
	getProductVersionCounts,
} from "./productUtils.js";
import { mapToProductV2 } from "./productV2Utils.js";

export const expressProductRouter: Router = Router({ mergeParams: true });

// Get list of products
expressProductRouter.get("/products", async (req: any, res) => {
	try {
		const { db } = req;
		const products = await ProductService.listFull({
			db,
			orgId: req.orgId,
			env: req.env,
		});

		sortFullProducts({ products });

		const groupToDefaults = getGroupToDefaults({
			defaultProds: products,
		});

		res.status(200).json({
			products: products.map((p) =>
				mapToProductV2({ product: p, features: req.features }),
			),
			groupToDefaults,
		});
	} catch (error) {
		console.error("Failed to get products", error);
		res.status(500).send(error);
	}
});

// Get counts for all products
expressProductRouter.get("/product_counts", async (req: any, res) => {
	try {
		const { db } = req;
		const products = await ProductService.listFull({
			db,
			orgId: req.orgId,
			env: req.env,
		});

		const counts = await Promise.all(
			products.map(async (product) => {
				return CusProdReadService.getCountsForAllVersions({
					db,
					productId: product.id,
					orgId: req.orgId,
					env: req.env,
				});
			}),
		);

		const result: { [key: string]: any } = {};
		for (let i = 0; i < products.length; i++) {
			if (!result[products[i].id]) {
				result[products[i].id] = counts[i];
			}
		}

		res.status(200).send(result);
	} catch (error) {
		console.error("Failed to get products", error);
		res.status(500).send(error);
	}
});

// Get list of features
expressProductRouter.get("/features", async (req: any, res) => {
	try {
		res.status(200).json({ features: req.features });
	} catch (error) {
		console.error("Failed to get features", error);
		res.status(500).send(error);
	}
});

// Get list of rewards
expressProductRouter.get("/rewards", async (req: any, res) => {
	try {
		const { db, orgId, env } = req;
		const rewards = await RewardService.list({ db, orgId, env });
		const rewardPrograms = await RewardProgramService.list({
			db,
			orgId,
			env,
		});
		res.status(200).send({ rewards, rewardPrograms });
	} catch (error) {
		handleFrontendReqError({
			error,
			req,
			res,
			action: "Get rewards",
		});
	}
});

// // Get single product data
// expressProductRouter.get("/:productId/data2", async (req: any, res) => {
// 	try {
// 		const { productId } = req.params;
// 		const { version } = req.query;
// 		const { db, orgId, env } = req;

// 		const [product, latestProduct] = await Promise.all([
// 			ProductService.getFull({
// 				db,
// 				idOrInternalId: productId,
// 				orgId,
// 				env,
// 				version: version ? parseInt(version) : undefined,
// 			}),
// 			ProductService.getFull({
// 				db,
// 				idOrInternalId: productId,
// 				orgId,
// 				env,
// 			}),
// 		]);

// 		const productV2 = mapToProductV2({
// 			product: product,
// 			features: req.features,
// 		});

// 		res
// 			.status(200)
// 			.json({ product: productV2, numVersions: latestProduct.version });
// 	} catch (error) {
// 		console.error("Failed to get product", error);
// 		res.status(500).send(error);
// 	}
// });

// // Get counts for a single product
// expressProductRouter.get("/:productId/count", async (req: any, res) => {
// 	try {
// 		const { db, orgId, env } = req;
// 		const { productId } = req.params;
// 		const { version } = req.query;

// 		const product = await ProductService.get({
// 			db,
// 			id: productId,
// 			orgId,
// 			env,
// 			version: version ? parseInt(version) : undefined,
// 		});

// 		if (!product) {
// 			throw new ProductNotFoundError({ productId, version });
// 		}

// 		// Get counts from postgres
// 		const counts = await CusProdReadService.getCounts({
// 			db,
// 			internalProductId: product.internal_id,
// 		});

// 		res.status(200).send(counts);
// 	} catch (error) {
// 		handleFrontendReqError({
// 			error,
// 			req,
// 			res,
// 			action: "Get product counts (internal)",
// 		});
// 	}
// });

// Get list of migrations
expressProductRouter.get("/migrations", async (req: any, res) => {
	try {
		const { db, orgId, env } = req;
		const migrations = await MigrationService.getExistingJobs({
			db,
			orgId,
			env,
		});
		res.status(200).send({ migrations });
	} catch (error) {
		handleFrontendReqError({
			error,
			req,
			res,
			action: "Get migrations",
		});
	}
});

expressProductRouter.get("/data", async (req: any, res) => {
	try {
		const { db } = req;

		const allVersions = req.query.all_versions === "true";

		const [products, features, org, coupons, rewardPrograms, defaultProds] =
			await Promise.all([
				ProductService.listFull({
					db,
					orgId: req.orgId,
					env: req.env,
					archived: false,
					returnAll: allVersions,
				}),
				FeatureService.getFromReq(req),
				OrgService.getFromReq(req),
				RewardService.list({ db, orgId: req.orgId, env: req.env }),
				RewardProgramService.list({
					db,
					orgId: req.orgId,
					env: req.env,
				}),
				ProductService.listDefault({
					db,
					orgId: req.orgId,
					env: req.env,
				}),
			]);

		sortFullProducts({
			products: getLatestProducts(products),
		});

		const groupToDefaultProd = getGroupToDefaults({
			defaultProds,
		});

		res.status(200).json({
			products: products.map((product) => {
				return mapToProductV2({ product, features });
			}),
			versionCounts: getProductVersionCounts(products),
			features,
			org: createOrgResponse({ org, env: req.env }),
			rewards: coupons,
			rewardPrograms,
			groupToDefaults: groupToDefaultProd,
		});
	} catch (error) {
		console.error("Failed to get products", error);
		res.status(500).send(error);
	}
});

expressProductRouter.post("/data", async (req: any, res) => {
	try {
		const { db } = req;
		const { showArchived } = req.body;

		const [products, defaultProds, features, org, coupons, rewardPrograms] =
			await Promise.all([
				ProductService.listFull({
					db,
					orgId: req.orgId,
					env: req.env,
					// returnAll: true,
					archived: showArchived,
				}),
				ProductService.listDefault({
					db,
					orgId: req.orgId,
					env: req.env,
				}),
				FeatureService.getFromReq(req),
				OrgService.getFromReq(req),
				RewardService.list({ db, orgId: req.orgId, env: req.env }),
				RewardProgramService.list({
					db,
					orgId: req.orgId,
					env: req.env,
				}),
			]);

		// Group to default product
		const groupToDefaultProd = getGroupToDefaults({
			defaultProds,
		});

		res.status(200).json({
			products: sortFullProducts({ products }).map((product) => {
				return mapToProductV2({ product, features });
			}),
			groupToDefaults: groupToDefaultProd,
			versionCounts: getProductVersionCounts(products),
			features,
			org: createOrgResponse({ org, env: req.env }),
			rewards: coupons,
			rewardPrograms,
		});
	} catch (error) {
		console.error("Failed to get products", error);
		res.status(500).send(error);
	}
});

expressProductRouter.get("/counts", async (req: any, res) => {
	try {
		const { db } = req;
		const products = await ProductService.listFull({
			db,
			orgId: req.orgId,
			env: req.env,
			// returnAll: true,
		});

		const latestVersion = req.query.latest_version === "true";

		const counts = await Promise.all(
			products.map(async (product) => {
				if (latestVersion) {
					return CusProdReadService.getCounts({
						db,
						internalProductId: product.internal_id,
					});
				}

				return CusProdReadService.getCountsForAllVersions({
					db,
					productId: product.id,
					orgId: req.orgId,
					env: req.env,
				});
			}),
		);

		const result: { [key: string]: any } = {};
		for (let i = 0; i < products.length; i++) {
			if (!result[products[i].id]) {
				result[products[i].id] = counts[i];
			}
		}

		res.status(200).send(result);
	} catch (error) {
		console.error("Failed to get product counts", error);
		res.status(500).send(error);
	}
});

// expressProductRouter.get("/:productId/data", async (req: any, res) => {
// 	try {
// 		const { productId } = req.params;
// 		const { version } = req.query;
// 		const { db, orgId, env } = req;

// 		const [product, features, org, numVersions, existingMigrations] =
// 			await Promise.all([
// 				ProductService.getFull({
// 					db,
// 					idOrInternalId: productId,
// 					orgId,
// 					env,
// 					version: version ? parseInt(version) : undefined,
// 				}),
// 				FeatureService.getFromReq(req),
// 				OrgService.getFromReq(req),
// 				ProductService.getProductVersionCount({
// 					db,
// 					productId,
// 					orgId,
// 					env,
// 				}),
// 				MigrationService.getExistingJobs({
// 					db,
// 					orgId,
// 					env,
// 				}),
// 			]);

// 		if (!product) {
// 			throw new ProductNotFoundError({ productId, version });
// 		}

// 		const defaultProds = await ProductService.listDefault({
// 			db,
// 			orgId: req.orgId,
// 			env: req.env,
// 			group: product.group,
// 		});

// 		const groupDefaults = getGroupToDefaults({
// 			defaultProds,
// 		})?.[product.group];

// 		let entitlements = product.entitlements;
// 		let prices = product.prices;

// 		entitlements = entitlements.sort((a: any, b: any) => {
// 			return b.feature.id.localeCompare(a.feature.id);
// 		});

// 		prices = prices.sort((a: any, b: any) => {
// 			return b.id.localeCompare(a.id);
// 		});

// 		const productV2 = mapToProductV2({ product, features });

// 		res.status(200).send({
// 			product: productV2,
// 			entitlements,
// 			prices,
// 			features,
// 			org: {
// 				id: org.id,
// 				name: org.name,
// 				test_pkey: org.test_pkey,
// 				live_pkey: org.live_pkey,
// 				default_currency: org.default_currency,
// 			},
// 			numVersions,
// 			existingMigrations,
// 			groupDefaults: groupDefaults,
// 		});
// 	} catch (error) {
// 		handleFrontendReqError({
// 			error,
// 			req,
// 			res,
// 			action: "Get product data (internal)",
// 		});
// 	}
// });

expressProductRouter.post("/product_options", async (req: any, res: any) => {
	try {
		const { items } = req.body;

		const featureToOptions: { [key: string]: FeatureOptions } = {};

		for (const item of items) {
			if (isFeaturePriceItem(item) && item.usage_model === UsageModel.Prepaid) {
				featureToOptions[item.feature_id] = {
					feature_id: item.feature_id,
					quantity: 0,
				};
			}
		}

		res.status(200).send({ options: Object.values(featureToOptions) });
	} catch (error) {
		handleFrontendReqError({
			error,
			req,
			res,
			action: "Get product options",
		});
	}
});

expressProductRouter.get("/:productId/info", handleGetProductDeleteInfo);

expressProductRouter.get("/rewards", async (req: any, res: any) => {
	try {
		const { db, orgId, env } = req;

		const rewards = await RewardService.list({
			db,
			orgId,
			env,
		});

		res.status(200).send({ rewards });
	} catch (error) {
		handleFrontendReqError({
			error,
			req,
			res,
			action: "Get rewards",
		});
	}
});

expressProductRouter.get(
	"/has_entity_feature_id",
	async (req: any, res: any) => {
		try {
			const { db, orgId, env } = req;

			const hasEntityFeatureId = await EntitlementService.hasEntityFeatureId({
				db,
				orgId,
				env,
			});

			res.status(200).send({ hasEntityFeatureId });
		} catch (error) {
			handleFrontendReqError({
				error,
				req,
				res,
				action: "Check has entity feature id",
			});
		}
	},
);

import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCopyEnvironment } from "./handlers/handleCopyEnvironment.js";
import { handleGetProductCount } from "./internalHandlers/handleGetProductCount.js";
import { handleGetProductInternal } from "./internalHandlers/handleGetProductInternal.js";

// Hono router for internal/dashboard product routes
export const internalProductRouter = new Hono<HonoEnv>();

internalProductRouter.get("/:productId/count", ...handleGetProductCount);
internalProductRouter.get("/:productId/data", ...handleGetProductInternal);
internalProductRouter.post("/copy_to_production", ...handleCopyEnvironment);
