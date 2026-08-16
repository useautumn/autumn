import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	emptyLicenseStatesContext,
	type LicenseStatesContext,
	type ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

const planLicenseIdsInContext = ({
	productStatesContext,
}: {
	productStatesContext: ProductStatesContext;
}): string[] =>
	Object.values(productStatesContext.versionsByPlanId).flatMap((versions) =>
		versions.flatMap((version) => [
			...(version.licenses ?? []).map((link) => link.id),
			...(version.parent_plan_licenses ?? []).map((link) => link.id),
		]),
	);

/**
 * Customer references for every loaded link — declared licenses[] parents
 * and reverse license-parents of touched children.
 */
export const setupLicenseStatesContext = async ({
	ctx,
	productStatesContext,
}: {
	ctx: AutumnContext;
	productStatesContext: ProductStatesContext;
}): Promise<LicenseStatesContext> => {
	const planLicenseIds = planLicenseIdsInContext({ productStatesContext });
	if (planLicenseIds.length === 0) return emptyLicenseStatesContext();

	return {
		referencedPlanLicenseIds:
			await customerLicenseRepo.listReferencedPlanLicenseIds({
				db: ctx.db,
				planLicenseIds,
			}),
	};
};
