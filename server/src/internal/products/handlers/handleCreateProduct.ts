import {
	type CreateProductV2Params,
	CreateProductV2ParamsSchema,
	type Entitlement,
	type FreeTrial,
	type FullProduct,
	type Price,
	ProductAlreadyExistsError,
	type ProductV2,
} from "@autumn/shared";

import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getEntsWithFeature } from "../entitlements/entitlementUtils.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "../free-trials/freeTrialUtils.js";
import { ProductService } from "../ProductService.js";
import { handleNewProductItems } from "../product-items/productItemUtils/handleNewProductItems.js";
import { isDefaultTrial } from "../productUtils/classifyProduct.js";
import { getProductResponse } from "../productUtils/productResponseUtils/getProductResponse.js";
import {
	constructProduct,
	getGroupToDefaults,
	initProductInStripe,
} from "../productUtils.js";

export const disableCurrentDefault = async ({
	req,
	newProduct,
	// items,
	// freeTrial,
}: {
	req: AutumnContext;
	newProduct: CreateProductV2Params | ProductV2;
	// items: ProductItem[];
	// freeTrial: FreeTrial;
}) => {
	const { db, org, env, logger } = req;

	let defaultProds = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	defaultProds = defaultProds.filter((prod) => prod.id !== newProduct.id);

	if (defaultProds.length === 0) return;

	const defaults = getGroupToDefaults({
		defaultProds,
	})?.[newProduct.group];

	const willBeDefaultTrial = isDefaultTrial({ product: newProduct });

	if (willBeDefaultTrial) {
		// Disable current default trial
		const curDefault = defaults?.defaultTrial;
		if (curDefault) {
			logger.info(
				`Disabling trial on cur default trial product: ${curDefault.id}`,
			);
			await ProductService.updateByInternalId({
				db,
				internalId: curDefault.internal_id,
				update: { is_default: false },
			});
		}
	} else if (newProduct.is_default) {
		const curDefault = defaults?.free;
		if (curDefault) {
			logger.info(`Disabling trial on cur default product: ${curDefault.id}`);
			await ProductService.updateByInternalId({
				db,
				internalId: curDefault.internal_id,
				update: { is_default: false },
			});
		}
	}
};

/**
 * Route: POST /products - Create a product
 */
export const createProduct = createRoute({
	body: CreateProductV2ParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		// const query = c.req.valid("query");

		const { logger, org, features, env, db } = ctx;

		const existing = await ProductService.get({
			db,
			orgId: org.id,
			env,
			id: body.id,
		});

		// 1. If existing product, throw error
		if (existing) throw new ProductAlreadyExistsError({ productId: body.id });

		await disableCurrentDefault({
			req: ctx,
			newProduct: body,
		});

		const product = await ProductService.insert({
			db,
			product: constructProduct({
				productData: body,
				orgId: org.id,
				env,
			}),
		});

		const { items, free_trial } = body;

		let prices: Price[] = [];
		let entitlements: Entitlement[] = [];
		if (items) {
			const res = await handleNewProductItems({
				db,
				product,
				features,
				curPrices: [],
				curEnts: [],
				newItems: items,
				logger,
				isCustom: false,
				newVersion: false,
			});
			prices = res.prices;
			entitlements = res.entitlements;
		}

		await validateOneOffTrial({
			prices,
			freeTrial: free_trial || null,
		});

		let newFreeTrial: FreeTrial | null = null;
		if (free_trial) {
			newFreeTrial =
				(await handleNewFreeTrial({
					db,
					newFreeTrial: free_trial,
					curFreeTrial: null,
					internalProductId: product.internal_id,
					isCustom: false,
				})) || null;
		}

		const newFullProduct: FullProduct = {
			...product,
			prices,
			entitlements: getEntsWithFeature({ ents: entitlements, features }),
			free_trial: newFreeTrial,
		};

		await initProductInStripe({
			db,
			product: newFullProduct,
			org,
			env,
			logger,
		});

		await addTaskToQueue({
			jobName: JobName.DetectBaseVariant,
			payload: {
				curProduct: newFullProduct,
			},
		});

		const productResponse = await getProductResponse({
			product: newFullProduct,
			features,
		});

		return c.json(productResponse);
	},
});
