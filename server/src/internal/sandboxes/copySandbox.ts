import {
	AppEnv,
	ErrCode,
	isAnyCreditSystem,
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
	fromOrg,
	fromEnv: fromEnvArg,
	toSandboxId,
	productIds,
	featureIds,
}: {
	db: DrizzleCli;
	ctx: AutumnContext;
	masterOrg: Organization;
	fromSandboxId?: string;
	fromOrg?: Organization;
	fromEnv?: AppEnv;
	toSandboxId: string;
	productIds?: string[];
	featureIds?: string[];
}): Promise<{ fromSandbox: Organization; toSandbox: Organization }> => {
	if (fromSandboxId && fromSandboxId === toSandboxId) {
		throw new RecaseError({
			message: "Source and target sandboxes must be different",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Target is always an owned named sandbox. Source is either another owned
	// sandbox or — for a copy started from the default sandbox / production — the
	// master org at the caller's current env. Ownership failures fold into a
	// uniform 404 so ids/ownership can't be probed.
	const toSandbox = await getOwnedSandbox({
		db,
		masterOrg,
		sandboxId: toSandboxId,
	});

	let sourceOrg: Organization;
	let fromEnv: AppEnv;
	if (fromSandboxId) {
		sourceOrg = await getOwnedSandbox({
			db,
			masterOrg,
			sandboxId: fromSandboxId,
		});
		fromEnv = AppEnv.Sandbox;
	} else if (fromOrg && fromEnvArg) {
		// The only non-sandbox source is the caller's own master org; never copy
		// from an unrelated org into a sandbox this master owns.
		if (fromOrg.id !== masterOrg.id) {
			throw new RecaseError({
				message: "Invalid copy source",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		sourceOrg = fromOrg;
		fromEnv = fromEnvArg;
	} else {
		throw new RecaseError({
			message: "No copy source specified",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const toEnv = AppEnv.Sandbox;

	const [fromFeatures, toFeatures] = await Promise.all([
		FeatureService.list({ db, orgId: sourceOrg.id, env: fromEnv }),
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
			orgId: sourceOrg.id,
			env: fromEnv,
		});

		// A requested product/feature that isn't in the source would otherwise
		// no-op and still toast success; surface it instead.
		const sourceProductIds = new Set(fromProducts.map((p) => p.id));
		const missingProducts = requestedProductIds.filter(
			(id) => !sourceProductIds.has(id),
		);
		if (missingProducts.length > 0) {
			throw new RecaseError({
				message: `Plan${missingProducts.length > 1 ? "s" : ""} not found in source: ${missingProducts.join(", ")}`,
				code: ErrCode.ProductNotFound,
				statusCode: 404,
			});
		}

		const requestedFeatureIds = featureIds ?? [];
		const sourceFeatureIds = new Set(fromFeatures.map((f) => f.id));
		const missingFeatures = requestedFeatureIds.filter(
			(id) => !sourceFeatureIds.has(id),
		);
		if (missingFeatures.length > 0) {
			throw new RecaseError({
				message: `Feature${missingFeatures.length > 1 ? "s" : ""} not found in source: ${missingFeatures.join(", ")}`,
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}

		const wantedFeatureIds = new Set(requestedFeatureIds);
		for (const product of fromProducts) {
			if (!requestedProductIds.includes(product.id)) continue;
			const { items } = mapToProductV2({ product, features: fromFeatures });
			for (const item of items) {
				if (item.feature_id) wantedFeatureIds.add(item.feature_id);
			}
		}

		// Credit systems draw from metered features; bring those along too.
		for (const feature of fromFeatures) {
			if (!isAnyCreditSystem(feature.type)) continue;
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
		fromOrg: sourceOrg,
		fromEnv,
		toOrg: toSandbox,
		toEnv,
		productIds: productIdsToCopy,
		fromFeatures,
	});

	await invalidateProductsCache({ orgId: toSandbox.id, env: toEnv });

	return { fromSandbox: sourceOrg, toSandbox };
};
