import {
	type AppEnv,
	type CreateFeature,
	CreateFeatureSchema,
	ErrCode,
	type Feature,
	isAnyCreditSystem,
	type Organization,
	ProductAlreadyExistsError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils.js";
import { copyProduct } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";

const initNewFeature = ({
	data,
	orgId,
	env,
}: {
	data: CreateFeature;
	orgId: string;
	env: AppEnv;
}): Feature => ({
	...data,
	org_id: orgId,
	env,
	created_at: Date.now(),
	internal_id: generateId("fe"),
	archived: false,
});

/**
 * Copies a single product between (org, env) pairs. When fromOrg === toOrg this
 * is the classic same-org env-copy; when they differ it's a named-sandbox
 * promote into the master org. The handler owns the auth gate that decides the
 * orgs — this only executes the copy.
 */
export const copyProductForOrgs = async ({
	db,
	logger,
	fromOrg,
	fromEnv,
	toOrg,
	toEnv,
	fromProductId,
	toId,
	toName,
}: {
	db: DrizzleCli;
	logger: Logger;
	fromOrg: Organization;
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
	fromProductId: string;
	toId: string;
	toName: string;
}): Promise<void> => {
	const crossOrg = fromOrg.id !== toOrg.id;

	if (!crossOrg && fromEnv === toEnv && fromProductId === toId) {
		throw new RecaseError({
			message: `Product ID ${toId} already exists in ${toEnv}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const toProduct = await ProductService.get({
		db,
		id: toId,
		orgId: toOrg.id,
		env: toEnv,
	});
	if (toProduct) {
		throw new ProductAlreadyExistsError({
			productId: toId,
			message: `Product ${toId} already exists in ${toEnv}`,
		});
	}

	const [fromFullProduct, fromFeatures, toFeatures] = await Promise.all([
		ProductService.getFull({
			db,
			idOrInternalId: fromProductId,
			orgId: fromOrg.id,
			env: fromEnv,
		}),
		FeatureService.list({ db, orgId: fromOrg.id, env: fromEnv }),
		FeatureService.list({ db, orgId: toOrg.id, env: toEnv }),
	]);

	// A variant's base_internal_product_id points at a product in the source
	// org; there's no safe cross-org remap, so refuse rather than land a dangling
	// reference.
	if (crossOrg && fromFullProduct.base_internal_product_id) {
		throw new RecaseError({
			message:
				"Variant plans can't be promoted directly. Promote the base plan instead.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	fromFullProduct.is_default = false;
	if (crossOrg) {
		fromFullProduct.base_variant_id = null;
	}

	const featureIdsToCopy = new Set(
		fromFullProduct.entitlements.map((e) => e.feature.id),
	);
	// Credit systems draw from metered features; bring those along so a promoted
	// credit system isn't left pointing at a feature the target lacks.
	for (const feature of fromFeatures) {
		if (!isAnyCreditSystem(feature.type)) continue;
		if (!featureIdsToCopy.has(feature.id)) continue;
		const config = feature.config as
			| { schema?: { metered_feature_id: string }[] }
			| null
			| undefined;
		for (const entry of config?.schema ?? []) {
			featureIdsToCopy.add(entry.metered_feature_id);
		}
	}

	if (crossOrg || fromEnv !== toEnv) {
		for (const fromFeature of fromFeatures.filter((f) =>
			featureIdsToCopy.has(f.id),
		)) {
			const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

			if (toFeature && fromFeature.type !== toFeature.type) {
				throw new RecaseError({
					message: `Feature ${fromFeature.name} exists in ${toEnv}, but has a different config. Please match them then try again.`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			if (!toFeature) {
				const res = await FeatureService.insert({
					db,
					data: initNewFeature({
						data: CreateFeatureSchema.parse(fromFeature),
						orgId: toOrg.id,
						env: toEnv,
					}),
					logger,
				});
				toFeatures.push(res![0]);
			}
		}
	}

	await copyProduct({
		db,
		product: fromFullProduct,
		toOrgId: toOrg.id,
		toId,
		toName,
		fromEnv,
		toEnv,
		toFeatures,
		fromFeatures,
		org: toOrg,
		logger,
	});

	await invalidateProductsCache({ orgId: toOrg.id, env: toEnv });
	if (crossOrg || fromEnv !== toEnv) {
		await invalidateProductsCache({ orgId: fromOrg.id, env: fromEnv });
	}
};
