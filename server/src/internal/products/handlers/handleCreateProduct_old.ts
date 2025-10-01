import {
	APIProductSchema,
	CreateProductSchema,
	type Entitlement,
	ErrCode,
	type FreeTrial,
	type FullProduct,
	type Price,
	type Product,
	ProductAlreadyExistsError,
	type ProductItem,
} from "@autumn/shared";
import {
	handleNewFreeTrial,
	validateAndInitFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";
import {
	constructProduct,
	getGroupToDefaults,
	initProductInStripe,
} from "@/internal/products/productUtils.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	keyToTitle,
	notNullish,
	nullish,
	validateId,
} from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { validateOneOffTrial } from "../free-trials/freeTrialUtils.js";
import { isDefaultTrial } from "../productUtils/classifyProduct.js";

const validateCreateProduct = async ({ req }: { req: ExtendedRequest }) => {
	const { free_trial, items } = req.body;
	const { orgId, env, db, features } = req;

	const productData = CreateProductSchema.parse(req.body);

	validateId("Product", productData.id);

	if (nullish(req.body.name)) {
		productData.name = keyToTitle(productData.id);
	}

	const existing = await ProductService.get({
		db,
		orgId,
		env,
		id: productData.id,
	});

	// 1. If existing product, throw error
	if (existing) {
		throw new ProductAlreadyExistsError({
			productId: productData.id,
		});
	}

	// 2. Validate items if exist

	if (items && !Array.isArray(items)) {
		throw new RecaseError({
			message: "Items must be an array",
			code: ErrCode.InvalidRequest,
		});
	} else if (items) {
		validateProductItems({
			newItems: items,
			features,
			orgId: req.orgId,
			env: req.env,
		});
	}

	// 3. Validate free trial if exist
	let freeTrial: FreeTrial | null = null;
	if (notNullish(free_trial)) {
		// console.log("Free trial before:", free_trial);
		freeTrial = validateAndInitFreeTrial({
			freeTrial: free_trial,
			internalProductId: productData.id,
			isCustom: false,
		});
		// console.log("Free trial after:", freeTrial);
	}

	return {
		features,
		freeTrial,
		productData,
	};
};

export const disableCurrentDefault = async ({
	req,
	newProduct,
	items,
	freeTrial,
}: {
	req: ExtendedRequest;
	newProduct: Product;
	items: ProductItem[];

	freeTrial: FreeTrial | null;
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

	const willBeDefaultTrial = isDefaultTrial({
		product: {
			...newProduct,
			free_trial: freeTrial,
			items: items || [],
		},
	});

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

export const handleCreateProduct = async (req: Request, res: any) =>
	routeHandler({
		req,
		res,
		action: "POST /products",
		handler: async (req, res) => {
			const { items } = req.body;

			const { logtail: logger, org, features, env, db } = req;

			const { freeTrial, productData } = await validateCreateProduct({
				req,
			});

			const newProduct = constructProduct({
				productData,
				orgId: org.id,
				env,
			});

			await disableCurrentDefault({
				req,
				newProduct,
				items,
				freeTrial: freeTrial || null,
			});

			const product = await ProductService.insert({ db, product: newProduct });

			let prices: Price[] = [];
			let entitlements: Entitlement[] = [];
			if (notNullish(items)) {
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
				freeTrial: freeTrial || null,
			});

			await initProductInStripe({
				db,
				product: {
					...product,
					prices,
					entitlements,
				} as FullProduct,
				org,
				env,
				logger,
			});

			if (notNullish(freeTrial)) {
				await handleNewFreeTrial({
					db,
					newFreeTrial: freeTrial,
					curFreeTrial: null,
					internalProductId: product.internal_id,
					isCustom: false,
				});
			}

			await addTaskToQueue({
				jobName: JobName.DetectBaseVariant,
				payload: {
					curProduct: {
						...product,
						prices,
						entitlements: [],
					},
				},
			});

			res.status(200).json(
				APIProductSchema.parse({
					...product,
					autumn_id: product.internal_id,
					items: items || [],
					free_trial: freeTrial,
				}),
			);
		},
	});
