import {
	AppEnv,
	ErrCode,
	FeatureType,
	mapToProductV2,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleCopyFeatures } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyFeatures.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils.js";
import { getOwnedSandbox } from "./getOwnedSandbox.js";

/**
 * Copies plans (products) + features from one named sandbox into another.
 *
 * Both sandboxes are sub-orgs of the master org (`is_sandbox=true`,
 * `created_by = masterOrg.id`), each its own organization living in
 * `AppEnv.Sandbox`. The caller (a master-org dashboard session) must own BOTH
 * sandboxes; `getOwnedSandbox` applies the same 404-masking ownership check as
 * `assertSandboxAccess`, so a missing or non-owned id is indistinguishable from
 * a 404 and we never touch any org's live catalog.
 */
export const copySandboxForOrg = async ({
	db,
	ctx,
	masterOrg,
	fromSandboxId,
	toSandboxId,
	productIds,
	featureIds,
}: {
	db: DrizzleCli;
	ctx: AutumnContext;
	masterOrg: Organization;
	fromSandboxId: string;
	toSandboxId: string;
	productIds?: string[];
	featureIds?: string[];
}): Promise<{ fromSandbox: Organization; toSandbox: Organization }> => {
	if (fromSandboxId === toSandboxId) {
		throw new RecaseError({
			message: "Source and target sandboxes must be different",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Authorize the caller for BOTH sandboxes. Either resolution failing folds
	// into a uniform 404 so ownership/existence can't be probed.
	const [fromSandbox, toSandbox] = await Promise.all([
		getOwnedSandbox({ db, masterOrg, sandboxId: fromSandboxId }),
		getOwnedSandbox({ db, masterOrg, sandboxId: toSandboxId }),
	]);

	const fromEnv = AppEnv.Sandbox;
	const toEnv = AppEnv.Sandbox;

	const [fromFeatures, toFeatures] = await Promise.all([
		FeatureService.list({ db, orgId: fromSandbox.id, env: fromEnv }),
		FeatureService.list({ db, orgId: toSandbox.id, env: toEnv }),
	]);

	// No filter => whole-catalog copy. Any filter => copy only the requested
	// products + features, plus every feature the requested products reference
	// so a copied plan never lands with a dangling feature reference.
	const selective = productIds !== undefined || featureIds !== undefined;
	let featuresToCopy = fromFeatures;
	let productIdsToCopy = productIds;

	if (selective) {
		const requestedProductIds = productIds ?? [];
		const fromProducts = await ProductService.listFull({
			db,
			orgId: fromSandbox.id,
			env: fromEnv,
		});

		const wantedFeatureIds = new Set(featureIds ?? []);
		for (const product of fromProducts) {
			if (!requestedProductIds.includes(product.id)) continue;
			const { items } = mapToProductV2({ product, features: fromFeatures });
			for (const item of items) {
				if (item.feature_id) wantedFeatureIds.add(item.feature_id);
			}
		}

		// Credit systems draw from metered features; bring those along too.
		for (const feature of fromFeatures) {
			if (feature.type !== FeatureType.CreditSystem) continue;
			if (!wantedFeatureIds.has(feature.id)) continue;
			const config = feature.config as
				| { schema?: { metered_feature_id: string }[] }
				| null
				| undefined;
			for (const entry of config?.schema ?? []) {
				wantedFeatureIds.add(entry.metered_feature_id);
			}
		}

		featuresToCopy = fromFeatures.filter((f) => wantedFeatureIds.has(f.id));
		productIdsToCopy = requestedProductIds;
	}

	// Features first: products reference them, and credit systems reference
	// metered features (handleCopyFeatures orders the batches accordingly).
	await handleCopyFeatures({
		ctx,
		fromFeatures: featuresToCopy,
		toOrg: toSandbox,
		toEnv,
		toFeatures,
	});

	await handleCopyProducts({
		ctx,
		fromOrg: fromSandbox,
		fromEnv,
		toOrg: toSandbox,
		toEnv,
		productIds: productIdsToCopy,
		fromFeatures,
	});

	await invalidateProductsCache({ orgId: toSandbox.id, env: toEnv });

	return { fromSandbox, toSandbox };
};
