import {
	type FreeTrial,
	type FullProduct,
	mapToProductV2,
	mergeBillingControls,
	notNullish,
	ProductNotFoundError,
	type ProductV2,
	productsAreSame,
	RecaseError,
	ErrCode,
	UpdateProductSchema,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { handleUpdateProductDetails } from "@/internal/products/handlers/handleUpdatePlan/updateProductDetails.js";
import { handleVersionProductV2 } from "@/internal/products/handlers/handleVersionProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import { productRepo } from "@/internal/products/repos/productRepo.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { resolveInPlaceEdit } from "./inPlaceUpdateUtils.js";
import { validateDefaultFlag } from "./validateDefaultFlag.js";

interface UpdateProductParams {
	ctx: AutumnContext;
	productId: string;
	query: {
		upsert?: boolean;
		version?: number;
		disable_version?: boolean;
		force_version?: boolean;
	};
	updates: UpdateProductV2Params;
	initialFullProduct?: FullProduct;
	baseInternalProductId?: string;
}
export const updateProduct = async ({
	ctx,
	query,
	productId,
	updates,
	initialFullProduct,
	baseInternalProductId,
}: UpdateProductParams) => {
	const { db, org, env, features, logger } = ctx;
	const { version, upsert, disable_version, force_version } = query;

	if (force_version && disable_version) {
		throw new RecaseError({
			message: "Cannot use both force_version and disable_version",
			code: ErrCode.ConflictingVersionFlags,
			statusCode: 400,
		});
	}

	const getFullProduct = async () => {
		if (initialFullProduct) return initialFullProduct;
		return ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
			version,
		});
	};

	const [fullProduct, rewardPrograms, _defaultProds] = await Promise.all([
		getFullProduct(),
		rewardProgramRepo.getByProductId({
			db,
			productIds: [productId],
			orgId: org.id,
			env,
		}),
		ProductService.listDefault({
			db,
			orgId: org.id,
			env,
		}),
	]);

	if (!fullProduct) throw new ProductNotFoundError({ productId: productId });

	const cusProductsCurVersion = await CusProductService.getByInternalProductId({
		db,
		internalProductId: fullProduct.internal_id,
	});

	const curProductV2 = mapToProductV2({
		product: fullProduct,
		features,
	});

	const newFreeTrial =
		"free_trial" in updates
			? ((updates.free_trial as FreeTrial | undefined) ?? undefined)
			: (curProductV2.free_trial ?? undefined);

	const newProductV2: ProductV2 = {
		...curProductV2,
		...updates,
		group: updates.group || curProductV2.group || "",
		items: updates.items ?? curProductV2.items,
		free_trial: newFreeTrial,
		billing_controls: mergeBillingControls(
			curProductV2.billing_controls,
			updates.billing_controls,
		),
	};

	await validateDefaultFlag({
		ctx,
		body: updates,
		curProduct: fullProduct,
	});

	const itemsExist = notNullish(updates.items);
	const cusProductExists = cusProductsCurVersion.length > 0;
	const freeTrialProvided = "free_trial" in updates;
	const billingControlsProvided = "billing_controls" in updates;

	if (cusProductExists && !disable_version && !force_version && billingControlsProvided) {
		const {
			billingControlsSame,
			itemsSame,
			freeTrialsSame,
			detailsSame,
			configSame,
			optionsSame,
			metadataSame,
		} = productsAreSame({
			newProductV2: newProductV2,
			curProductV2,
			features,
		});

		// Only take the billing-controls-only shortcut when nothing else changed;
		// otherwise fall through so detail/default guards run on other fields.
		const onlyBillingControlsChanged =
			!billingControlsSame &&
			itemsSame &&
			freeTrialsSame &&
			detailsSame &&
			configSame &&
			optionsSame &&
			metadataSame;

		if (onlyBillingControlsChanged) {
			const newProduct = await handleVersionProductV2({
				ctx,
				newProductV2: newProductV2,
				latestProduct: fullProduct,
				org,
				env,
				baseInternalProductId,
			});

			return newProduct;
		}
	}

	await handleUpdateProductDetails({
		db,
		curProduct: fullProduct,
		newProduct: UpdateProductSchema.parse(updates),
		newFreeTrial: newFreeTrial,
		items: updates.items || curProductV2.items,
		org,
		rewardPrograms,
		logger: ctx.logger,
	});

	if (notNullish(updates.metadata)) {
		await productRepo.updateMetadataByExternalId({
			db,
			orgId: org.id,
			env,
			id: updates.id || fullProduct.id,
			metadata: updates.metadata,
		});
		fullProduct.metadata = updates.metadata;
	}

	// Check if versioning is needed (customers exist AND items or free trial changed)
	if (force_version) {
		const newProduct = await handleVersionProductV2({
			ctx,
			newProductV2: newProductV2,
			latestProduct: fullProduct,
			org,
			env,
			baseInternalProductId,
		});
		return newProduct;
	}

	if (
		cusProductExists &&
		!disable_version &&
		(itemsExist || freeTrialProvided)
	) {
		const { itemsSame, freeTrialsSame, billingControlsSame } = productsAreSame({
			newProductV2: newProductV2,
			curProductV1: fullProduct,
			features,
		});

		const productSame = itemsSame && freeTrialsSame && billingControlsSame;

		if (!productSame) {
			const newProduct = await handleVersionProductV2({
				ctx,
				newProductV2: newProductV2,
				latestProduct: fullProduct,
				org,
				env,
				baseInternalProductId,
			});

			return newProduct;
		}

		return fullProduct;
	}

	const { free_trial } = updates;

	if (updates.items) {
		const newItems = updates.items;
		if (cusProductExists && disable_version) {
			// Retire the shared catalog rows + insert their replacements atomically:
			// a failure between the two must not leave the plan with retired rows
			// and no replacement.
			await db.transaction(async (transaction) => {
				const tx = transaction as unknown as DrizzleCli;
				const inPlace = await resolveInPlaceEdit({
					db: tx,
					items: newItems,
					currentFullProduct: fullProduct,
					features,
				});
				await handleNewProductItems({
					db: tx,
					curPrices: inPlace.curPrices,
					curEnts: inPlace.curEnts,
					newItems: inPlace.items,
					features,
					product: fullProduct,
					logger: ctx.logger,
					isCustom: false,
				});
			});
		} else {
			await handleNewProductItems({
				db,
				curPrices: fullProduct.prices,
				curEnts: fullProduct.entitlements,
				newItems,
				features,
				product: fullProduct,
				logger: ctx.logger,
				isCustom: false,
			});
		}
	}

	const latestProductId = updates.id || fullProduct.id;

	// New full product
	const newFullProduct = await ProductService.getFull({
		db,
		idOrInternalId: latestProductId,
		orgId: org.id,
		env,
		version: fullProduct.version,
	});

	if (free_trial !== undefined) {
		await validateOneOffTrial({
			prices: newFullProduct.prices,
			freeTrial: free_trial,
		});

		await handleNewFreeTrial({
			db,
			curFreeTrial: fullProduct.free_trial,
			newFreeTrial: free_trial,
			internalProductId: fullProduct.internal_id,
			isCustom: false,
		});
	}

	// New full product

	await initProductInStripe({
		ctx,
		product: newFullProduct,
	});

	logger.info("Adding task to queue to detect base variant");
	await addTaskToQueue({
		jobName: JobName.DetectBaseVariant,
		payload: {
			curProduct: newFullProduct,
		},
	});

	await addTaskToQueue({
		jobName: JobName.RewardMigration,
		payload: {
			oldPrices: fullProduct.prices,
			productId: latestProductId,
			orgId: org.id,
			env,
		},
	});

	const productResponse = await getProductResponse({
		product: newFullProduct,
		features,
	});

	return productResponse;
};
