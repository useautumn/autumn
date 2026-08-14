import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	emptyLicenseStatesContext,
	type LicenseStatesContext,
	type ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

/**
 * Customer references for current links of every parent declaring licenses[].
 * Compute uses this to retire vs update a row in place.
 */
export const setupLicenseStatesContext = async ({
	ctx,
	params,
	productStatesContext,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): Promise<LicenseStatesContext> => {
	const declaringPlanIds = [
		...new Set(
			params.plans
				.filter((entry) => entry.licenses !== undefined)
				.map((entry) => entry.plan_id),
		),
	];
	if (declaringPlanIds.length === 0) return emptyLicenseStatesContext();

	const planLicenseIds = declaringPlanIds.flatMap((planId) =>
		(productStatesContext.versionsByPlanId[planId] ?? []).flatMap((version) =>
			(version.licenses ?? []).map((link) => link.id),
		),
	);

	return {
		referencedPlanLicenseIds:
			await customerLicenseRepo.listReferencedPlanLicenseIds({
				db: ctx.db,
				planLicenseIds,
			}),
	};
};
