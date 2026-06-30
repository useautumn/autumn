import { AppEnv, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleCopyFeatures } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyFeatures.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
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
}: {
	db: DrizzleCli;
	ctx: AutumnContext;
	masterOrg: Organization;
	fromSandboxId: string;
	toSandboxId: string;
}): Promise<{ fromSandbox: Organization; toSandbox: Organization }> => {
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

	// Features first: products reference them, and credit systems reference
	// metered features (handleCopyFeatures orders the batches accordingly).
	await handleCopyFeatures({
		ctx,
		fromFeatures,
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
	});

	await invalidateProductsCache({ orgId: toSandbox.id, env: toEnv });

	return { fromSandbox, toSandbox };
};
