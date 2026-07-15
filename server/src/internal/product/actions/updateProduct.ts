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
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import {
	applyPreparedPlanLicenseSync,
	validatePlanLicenseUpdate,
} from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { updateVariants } from "@/internal/product/actions/updateVariants/updateVariants.js";
import {
	handleNewFreeTrial,
	validateOneOffTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { handleUpdateProductDetails } from "@/internal/products/handlers/handleUpdatePlan/updateProductDetails.js";
import { validateProductLicenseLinks } from "@/internal/products/handlers/handleUpdatePlan/validateProductLicenseLinks.js";
import { handleVersionProductV2 } from "@/internal/products/handlers/handleVersionProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { productRepo } from "@/internal/products/repos/productRepo.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { applyOtherProductVersions } from "./updateProduct/applyOtherProductVersions.js";
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
		all_versions?: boolean;
	};
	updates: UpdateProductV2Params;
	initialFullProduct?: FullProduct;
	baseInternalProductId?: string | null;
	propagateToVariants?: string[];
	variantUpdates?: UpdateVariantParams[];
	allowVariantSettingsUpdate?: boolean;
	skipVariantUpdates?: boolean;
}

const resolveBaseInternalProductId = async ({
	ctx,
	productId,
	basePlanId,
}: {
	ctx: AutumnContext;
	productId: string;
	basePlanId: string | null;
}) => {
	if (basePlanId === null) return null;
	if (basePlanId === productId) {
		throw new RecaseError({
			message: "A plan cannot be linked to itself as a base plan.",
			code: ErrCode.InvalidPropagationTarget,
			statusCode: 400,
		});
	}

	const base = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: basePlanId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (base.base_internal_product_id !== null) {
		throw new RecaseError({
			message: "A variant plan cannot be used as a base plan.",
			code: ErrCode.InvalidPropagationTarget,
			statusCode: 400,
		});
	}

	return base.internal_id;
};

export const updateProduct = async ({
	ctx,
	query,
	productId,
	updates: rawProductUpdates,
	initialFullProduct,
	baseInternalProductId,
	propagateToVariants = [],
	variantUpdates = [],
	allowVariantSettingsUpdate = false,
	skipVariantUpdates = false,
}: UpdateProductParams) => {
	const { db, org, env, features } = ctx;
	const { version, disable_version, force_version, all_versions } = query;
	const effectiveDisableVersion = disable_version || all_versions;
	const basePlanIdProvided = "base_plan_id" in rawProductUpdates;
	const { base_plan_id: basePlanId, ...productUpdates } = rawProductUpdates;
	validatePlanLicenseUpdate({
		allVersions: all_versions,
		licenses: productUpdates.licenses,
	});

	if (force_version && disable_version) {
		throw new RecaseError({
			message: "Cannot use both force_version and disable_version",
			code: ErrCode.ConflictingVersionFlags,
			statusCode: 400,
		});
	}
	if (all_versions && disable_version) {
		throw new RecaseError({
			message: "Cannot use both all_versions and disable_version",
			code: ErrCode.ConflictingVersionFlags,
			statusCode: 400,
		});
	}
	if (all_versions && force_version) {
		throw new RecaseError({
			message: "Cannot use both all_versions and force_version",
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
	const resolvedBaseInternalProductId = basePlanIdProvided
		? await resolveBaseInternalProductId({
				ctx,
				productId: fullProduct.id,
				basePlanId: basePlanId ?? null,
			})
		: undefined;
	const nextBaseInternalProductId =
		resolvedBaseInternalProductId !== undefined
			? resolvedBaseInternalProductId
			: baseInternalProductId;
	const applyBasePlanLink = async () => {
		if (!basePlanIdProvided) return;
		await ProductService.updateByInternalId({
			db,
			internalId: fullProduct.internal_id,
			update: { base_internal_product_id: resolvedBaseInternalProductId },
		});
	};
	validateVariantSettingsUpdate({
		allowVariantSettingsUpdate,
		fullProduct,
		currentProduct: curProductV2,
		updates: productUpdates,
	});

	const applyVariantUpdates = async ({
		latestBase,
	}: {
		latestBase: FullProduct;
	}) => {
		if (skipVariantUpdates) return;
		if (baseBeforeUpdate.base_internal_product_id !== null) return;
		if (
			!shouldApplyVariantUpdates({
				oldBase: baseBeforeUpdate,
				latestBase,
				propagateToVariants,
				variantUpdates,
				updates: productUpdates,
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
			disableVersion: effectiveDisableVersion,
			forceVersion: force_version,
			allVersions: all_versions,
		});
	};
	const applyHistoricalVersions = async ({
		latestProduct,
	}: {
		latestProduct: FullProduct;
	}) => {
		await applyOtherProductVersions({
			ctx,
			enabled: all_versions,
			productBeforeUpdate: baseBeforeUpdate,
			latestProduct,
			updateVersion: async ({ product, updates }) => {
				await updateProduct({
					ctx,
					productId: product.id,
					query: { version: product.version, disable_version: true },
					updates,
					initialFullProduct: product,
					allowVariantSettingsUpdate,
					skipVariantUpdates: true,
				});
			},
		});
	};
	const newFreeTrial =
		"free_trial" in productUpdates
			? ((productUpdates.free_trial as FreeTrial | undefined) ?? undefined)
			: (curProductV2.free_trial ?? undefined);

	const productFields = { ...productUpdates };
	delete productFields.licenses;
	const newProductV2: ProductV2 = {
		...curProductV2,
		...productFields,
		group: productUpdates.group || curProductV2.group || "",
		items: productUpdates.items ?? curProductV2.items,
		free_trial: newFreeTrial,
		billing_controls: mergeBillingControls(
			curProductV2.billing_controls,
			productUpdates.billing_controls,
		),
	};

	if (Object.keys(productUpdates).length === 0) {
		await applyBasePlanLink();
		const latestProduct = basePlanIdProvided
			? await ProductService.getFull({
					db,
					idOrInternalId: fullProduct.id,
					orgId: org.id,
					env,
					version: fullProduct.version,
				})
			: fullProduct;
		await applyVariantUpdates({ latestBase: fullProduct });
		return getProductResponse({
			product: latestProduct,
			features,
		});
	}

	await validateDefaultFlag({
		ctx,
		body: productUpdates,
		curProduct: fullProduct,
	});

	const itemsExist = notNullish(productUpdates.items);
	const customerProductExists = customerUsage.hasAnyCustomerProducts;
	const versionableCustomerProductExists =
		customerUsage.hasVersionableCustomerProducts;
	const freeTrialProvided = "free_trial" in productUpdates;
	const billingControlsProvided = "billing_controls" in productUpdates;

	const same = productsAreSame({ newProductV2, curProductV2, features });
	const billingControlsOnlyChanged =
		billingControlsProvided &&
		!same.billingControlsSame &&
		same.itemsSame &&
		same.freeTrialsSame &&
		same.detailsSame &&
		same.configSame &&
		same.optionsSame &&
		same.metadataSame;
	const productVersioningEligible =
		versionableCustomerProductExists &&
		!effectiveDisableVersion &&
		(itemsExist || freeTrialProvided);
	const productChanged = !same.itemsSame || !same.freeTrialsSame;
	const billingControlsWillVersion =
		!force_version &&
		versionableCustomerProductExists &&
		!effectiveDisableVersion &&
		billingControlsOnlyChanged;
	const productWillVersion = productVersioningEligible && productChanged;
	const willVersion =
		force_version || billingControlsWillVersion || productWillVersion;
	const preparedLicenses = await validateProductLicenseLinks({
		ctx,
		fromInternalProductId: fullProduct.internal_id,
		newProductV2,
		baseProduct: fullProduct,
		org,
		features,
		licenses: productUpdates.licenses,
		newParentVersion: willVersion,
	});
	const createVersion = () =>
		handleVersionProductV2({
			ctx,
			newProductV2,
			latestProduct: fullProduct,
			org,
			env,
			baseInternalProductId: nextBaseInternalProductId,
			preparedPlanLicenseSync: preparedLicenses,
		});

	if (billingControlsWillVersion) {
		const newProduct = await createVersion();
		const latestBase = await ProductService.getFull({
			db,
			idOrInternalId: newProduct.id,
			orgId: org.id,
			env,
		});
		await applyVariantUpdates({ latestBase });
		return newProduct;
	}

	await handleUpdateProductDetails({
		db,
		curProduct: fullProduct,
		newProduct: UpdateProductSchema.parse(productUpdates),
		newFreeTrial: newFreeTrial,
		items: productUpdates.items || curProductV2.items,
		org,
		rewardPrograms,
		logger: ctx.logger,
	});
	if (preparedLicenses && !willVersion) {
		await applyPreparedPlanLicenseSync({ ctx, prepared: preparedLicenses });
	}

	if (notNullish(productUpdates.metadata)) {
		await productRepo.updateMetadataByExternalId({
			db,
			orgId: org.id,
			env,
			id: productUpdates.id || fullProduct.id,
			metadata: productUpdates.metadata,
		});
		fullProduct.metadata = productUpdates.metadata;
	}

	// Check if versioning is needed (customers exist AND items or free trial changed)
	if (force_version) {
		const newProduct = await createVersion();
		const latestBase = await ProductService.getFull({
			db,
			idOrInternalId: newProduct.id,
			orgId: org.id,
			env,
		});
		await applyVariantUpdates({ latestBase });
		return newProduct;
	}

	if (productVersioningEligible) {
		if (productWillVersion) {
			const newProduct = await createVersion();

			const latestBase = await ProductService.getFull({
				db,
				idOrInternalId: newProduct.id,
				orgId: org.id,
				env,
			});
			await applyVariantUpdates({ latestBase });

			return newProduct;
		}

		await applyHistoricalVersions({ latestProduct: fullProduct });
		await applyVariantUpdates({ latestBase: fullProduct });
		await applyBasePlanLink();
		return fullProduct;
	}

	const { free_trial } = productUpdates;

	if (productUpdates.items) {
		await updateProductItems({
			ctx,
			db,
			fullProduct,
			newItems: productUpdates.items,
			features,
			useInPlaceEdit: customerProductExists,
		});
	}

	const latestProductId = productUpdates.id || fullProduct.id;
	await applyBasePlanLink();

	// New full product
	let newFullProduct = await ProductService.getFull({
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
		newFullProduct = await ProductService.getFull({
			db,
			idOrInternalId: latestProductId,
			orgId: org.id,
			env,
			version: fullProduct.version,
		});
	}

	// New full product

	await applyHistoricalVersions({ latestProduct: newFullProduct });
	await applyVariantUpdates({ latestBase: newFullProduct });

	await initStripeResourcesForProducts({
		ctx,
		products: [newFullProduct],
		candidateProducts: [fullProduct],
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
