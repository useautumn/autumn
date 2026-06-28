import {
	ErrCode,
	type FreeTrial,
	type FullProduct,
	mergeBillingControls,
	notNullish,
	type ProductV2,
	productsAreSame,
	RecaseError,
	UpdateProductSchema,
	type UpdateProductV2Params,
	type UpdateVariantParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateVariants } from "@/internal/product/actions/updateVariants/updateVariants.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { handleUpdateProductDetails } from "@/internal/products/handlers/handleUpdatePlan/updateProductDetails.js";
import { handleVersionProductV2 } from "@/internal/products/handlers/handleVersionProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import { productRepo } from "@/internal/products/repos/productRepo.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { setupUpdateProductContext } from "./updateProduct/setupUpdateProductContext.js";
import { shouldApplyVariantUpdates } from "./updateProduct/shouldApplyVariantUpdates.js";
import { updateProductItems } from "./updateProduct/updateProductItems.js";
import { validateVariantSettingsUpdate } from "./updateProduct/validateVariantSettingsUpdate.js";
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
	propagateToVariants?: string[];
	variantUpdates?: UpdateVariantParams[];
	allowVariantSettingsUpdate?: boolean;
}

export const updateProduct = async ({
	ctx,
	query,
	productId,
	updates,
	initialFullProduct,
	baseInternalProductId,
	propagateToVariants = [],
	variantUpdates = [],
	allowVariantSettingsUpdate = false,
}: UpdateProductParams) => {
	const { db, org, env, features } = ctx;
	const { version, upsert, disable_version, force_version } = query;

	if (force_version && disable_version) {
		throw new RecaseError({
			message: "Cannot use both force_version and disable_version",
			code: ErrCode.ConflictingVersionFlags,
			statusCode: 400,
		});
	}

	const {
		fullProduct,
		baseBeforeUpdate,
		currentProductV2: curProductV2,
		rewardPrograms,
		customerUsage,
	} = await setupUpdateProductContext({
		ctx,
		productId,
		version,
		initialFullProduct,
	});
	validateVariantSettingsUpdate({
		allowVariantSettingsUpdate,
		fullProduct,
		currentProduct: curProductV2,
		updates,
	});

	const applyVariantUpdates = async ({
		latestBase,
	}: {
		latestBase: FullProduct;
	}) => {
		if (baseBeforeUpdate.base_internal_product_id !== null) return;
		if (
			!shouldApplyVariantUpdates({
				oldBase: baseBeforeUpdate,
				latestBase,
				propagateToVariants,
				variantUpdates,
				updates,
			})
		) {
			return;
		}

		await updateVariants({
			ctx,
			oldBase: baseBeforeUpdate,
			newBase: latestBase,
			propagateToVariants,
			variantUpdates,
			disableVersion: disable_version,
			forceVersion: force_version,
		});
	};

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

	if (Object.keys(updates).length === 0) {
		await applyVariantUpdates({ latestBase: fullProduct });
		return getProductResponse({
			product: fullProduct,
			features,
		});
	}

	await validateDefaultFlag({
		ctx,
		body: updates,
		curProduct: fullProduct,
	});

	const itemsExist = notNullish(updates.items);
	const customerProductExists = customerUsage.hasAnyCustomerProducts;
	const versionableCustomerProductExists =
		customerUsage.hasVersionableCustomerProducts;
	const freeTrialProvided = "free_trial" in updates;
	const billingControlsProvided = "billing_controls" in updates;

	if (
		versionableCustomerProductExists &&
		!disable_version &&
		!force_version &&
		billingControlsProvided
	) {
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

			const latestBase = await ProductService.getFull({
				db,
				idOrInternalId: newProduct.id,
				orgId: org.id,
				env,
			});
			await applyVariantUpdates({ latestBase });

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
		const latestBase = await ProductService.getFull({
			db,
			idOrInternalId: newProduct.id,
			orgId: org.id,
			env,
		});
		await applyVariantUpdates({ latestBase });
		return newProduct;
	}

	if (
		versionableCustomerProductExists &&
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

			const latestBase = await ProductService.getFull({
				db,
				idOrInternalId: newProduct.id,
				orgId: org.id,
				env,
			});
			await applyVariantUpdates({ latestBase });

			return newProduct;
		}

		await applyVariantUpdates({ latestBase: fullProduct });
		return fullProduct;
	}

	const { free_trial } = updates;

	if (updates.items) {
		await updateProductItems({
			ctx,
			db,
				fullProduct,
				newItems: updates.items,
				features,
				useInPlaceEdit: customerProductExists,
			});
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

	await applyVariantUpdates({ latestBase: newFullProduct });

	await initProductInStripe({
		ctx,
		product: newFullProduct,
	});

	// logger.info("Adding task to queue to detect base variant");
	// await addTaskToQueue({
	// 	jobName: JobName.DetectBaseVariant,
	// 	payload: {
	// 		curProduct: newFullProduct,
	// 	},
	// });

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
