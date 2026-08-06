import type {
	AppEnv,
	Feature,
	FullProduct,
	Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copyProduct } from "@/internal/products/productUtils.js";

/** Plan ids from the given set that already exist in the target (org, env). */
export const listExistingTargetPlanIds = async ({
	db,
	planIds,
	toOrg,
	toEnv,
}: {
	db: DrizzleCli;
	planIds: string[];
	toOrg: Organization;
	toEnv: AppEnv;
}): Promise<Set<string>> => {
	const existing = await Promise.all(
		planIds.map((planId) =>
			ProductService.get({ db, id: planId, orgId: toOrg.id, env: toEnv }),
		),
	);
	return new Set(
		existing
			.filter((product) => product !== undefined)
			.map((product) => product.id),
	);
};

/**
 * Copies a family plan into the target under its own id, never as a default,
 * dropping the base variant pointer on cross-org copies.
 */
export const copyPlanIntoTarget = async ({
	db,
	logger,
	plan,
	fromEnv,
	toOrg,
	toEnv,
	fromFeatures,
	toFeatures,
	crossOrg,
	baseInternalProductId,
}: {
	db: DrizzleCli;
	logger: Logger;
	plan: FullProduct;
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
	fromFeatures: Feature[];
	toFeatures: Feature[];
	crossOrg: boolean;
	baseInternalProductId?: string | null;
}): Promise<string> =>
	copyProduct({
		db,
		product: {
			...plan,
			is_default: false,
			base_variant_id: crossOrg ? null : plan.base_variant_id,
		},
		toOrgId: toOrg.id,
		toId: plan.id,
		toName: plan.name,
		fromEnv,
		toEnv,
		toFeatures,
		fromFeatures,
		org: toOrg,
		logger,
		baseInternalProductId,
	});
