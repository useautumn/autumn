import {
	ErrCode,
	mapToProductV2,
	ProductCatalogType,
	RecaseError,
	UpdateProductSchema,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { updateProductItems } from "@/internal/product/actions/updateProduct/updateProductItems.js";
import { handleUpdateProductDetails } from "@/internal/products/handlers/handleUpdatePlan/updateProductDetails.js";
import { productRepo } from "@/internal/products/repos/productRepo.js";
import { rewardProgramRepo } from "@/internal/rewards/repos/index.js";
import { getLicenseProduct } from "../licenseUtils.js";
import { planLicenseRepo } from "../repos/index.js";
import { validatePooledFeatures } from "./validatePooledFeatures.js";

export const updateLicenseProduct = async ({
	ctx,
	licensePlanId,
	version,
	updates,
}: {
	ctx: AutumnContext;
	licensePlanId: string;
	version?: number;
	updates: UpdateProductV2Params;
}) => {
	const { db, org, env, features } = ctx;
	const licenseProduct = await getLicenseProduct({
		db,
		idOrInternalId: licensePlanId,
		orgId: org.id,
		env,
		version,
	});

	if (
		updates.catalog_type &&
		updates.catalog_type !== ProductCatalogType.License
	) {
		throw new RecaseError({
			message: "A license product cannot be moved to another catalog.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (updates.is_default === true || updates.base_plan_id !== undefined) {
		throw new RecaseError({
			message: "License products cannot be defaults or plan variants.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (updates.free_trial) {
		throw new RecaseError({
			message: "License products do not support free trials.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const { metadata, items } = updates;
	if (items) {
		const pooledLinks = await planLicenseRepo.listByLicenseInternalProductId({
			db: ctx.db,
			licenseInternalProductId: licenseProduct.internal_id,
		});
		for (const link of pooledLinks) {
			validatePooledFeatures({
				ctx,
				pooledFeatureIds: link.pooled_feature_ids,
				licenseProduct,
				customize: link.customize,
				overrideItems: items,
			});
		}
	}
	const details = UpdateProductSchema.parse(updates);
	const currentProductV2 = mapToProductV2({
		product: licenseProduct,
		features,
	});
	const [rewardPrograms, customerUsage] = await Promise.all([
		rewardProgramRepo.getByProductId({
			db,
			productIds: [licenseProduct.id],
			orgId: org.id,
			env,
		}),
		customerProductRepo.getVersioningUsageForProduct({
			db,
			internalProductId: licenseProduct.internal_id,
		}),
	]);

	await handleUpdateProductDetails({
		db,
		curProduct: licenseProduct,
		newProduct: details,
		newFreeTrial: licenseProduct.free_trial ?? undefined,
		items: items ?? currentProductV2.items,
		org,
		rewardPrograms,
		logger: ctx.logger,
	});

	const latestProductId = details.id || licenseProduct.id;
	if (metadata !== undefined) {
		await productRepo.updateMetadataByExternalId({
			db,
			orgId: org.id,
			env,
			id: latestProductId,
			metadata,
		});
	}

	if (items) {
		await updateProductItems({
			ctx,
			db,
			fullProduct: licenseProduct,
			newItems: items,
			features,
			useInPlaceEdit: customerUsage.hasAnyCustomerProducts,
		});
	}

	const updatedProduct = await getLicenseProduct({
		db,
		idOrInternalId: latestProductId,
		orgId: org.id,
		env,
		version: licenseProduct.version,
	});

	return mapToProductV2({ product: updatedProduct, features });
};
