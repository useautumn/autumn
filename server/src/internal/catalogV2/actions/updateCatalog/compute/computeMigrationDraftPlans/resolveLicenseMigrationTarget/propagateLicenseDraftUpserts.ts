import type { UpdateCatalogParams } from "@autumn/shared";
import {
	includeCustomForMigrationDraft,
	upsertClaimsMigrationDraft,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/matchingDraftPlanParams";
import {
	type LicenseDraftUpsert,
	type LicenseDraftUpserts,
	licenseUpsertFromPlanLicense,
	sortLicenseDraftUpserts,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/licenseUpsertFromPlanLicense";
import {
	parentLicenseLinkForChild,
	propagateReachesLink,
	shouldPropagate,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Link deltas for children that follow this parent. */
export const propagateLicenseDraftUpserts = ({
	parent,
	upsertProductPlans,
	params,
	productStatesContext,
}: {
	parent: UpsertProductPlan;
	upsertProductPlans: UpsertProductPlan[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): LicenseDraftUpserts => {
	let includeCustom = includeCustomForMigrationDraft({
		upsertProductPlan: parent,
		params,
	});
	const resolved: LicenseDraftUpsert[] = [];

	for (const child of upsertProductPlans) {
		if (!upsertClaimsMigrationDraft({ upsertProductPlan: child, params })) {
			continue;
		}
		if (
			!shouldPropagate({
				parent,
				child,
				productStatesContext,
			})
		) {
			continue;
		}

		const currentPlanLicense = parentLicenseLinkForChild({ parent, child });
		if (!currentPlanLicense) continue;
		if (!propagateReachesLink({ currentPlanLicense, child })) continue;

		const planLicense = parent.planLicenses?.find(
			(link) => link.licensePlanId === child.row.planId,
		);
		if (!planLicense) continue;

		const entry = licenseUpsertFromPlanLicense({ planLicense });
		if (!entry) continue;

		resolved.push(entry);
		if (includeCustomForMigrationDraft({ upsertProductPlan: child, params })) {
			includeCustom = true;
		}
	}

	return {
		upserts: sortLicenseDraftUpserts(resolved.map((entry) => entry.upsert)),
		hasBillingChanges: resolved.some((entry) => entry.hasBillingChanges),
		includeCustom,
	};
};
