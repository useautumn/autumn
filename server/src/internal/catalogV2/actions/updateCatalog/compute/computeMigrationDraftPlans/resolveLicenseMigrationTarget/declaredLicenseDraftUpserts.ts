import type { UpdateCatalogParams } from "@autumn/shared";
import {
	includeCustomForMigrationDraft,
	upsertClaimsMigrationDraft,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/matchingDraftPlanParams";
import {
	type LicenseDraftUpserts,
	licenseUpsertFromPlanLicense,
	sortLicenseDraftUpserts,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/licenseUpsertFromPlanLicense";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const declaredParentIsClaimed = ({
	parent,
	upsertProductPlans,
	params,
}: {
	parent: UpsertProductPlan;
	upsertProductPlans: UpsertProductPlan[];
	params: UpdateCatalogParams;
}): boolean => {
	if (upsertClaimsMigrationDraft({ upsertProductPlan: parent, params })) {
		return true;
	}
	return upsertProductPlans.some(
		(child) =>
			upsertClaimsMigrationDraft({ upsertProductPlan: child, params }) &&
			parent.planLicenses?.some(
				(link) => link.licensePlanId === child.row.planId,
			),
	);
};

/** Final composed link deltas when this parent declared `licenses[]`. */
export const declaredLicenseDraftUpserts = ({
	parent,
	upsertProductPlans,
	params,
}: {
	parent: UpsertProductPlan;
	upsertProductPlans: UpsertProductPlan[];
	params: UpdateCatalogParams;
}): LicenseDraftUpserts => {
	const includeCustom =
		includeCustomForMigrationDraft({ upsertProductPlan: parent, params }) ||
		upsertProductPlans.some(
			(child) =>
				upsertClaimsMigrationDraft({ upsertProductPlan: child, params }) &&
				includeCustomForMigrationDraft({ upsertProductPlan: child, params }),
		);

	if (!declaredParentIsClaimed({ parent, upsertProductPlans, params })) {
		return { upserts: [], hasBillingChanges: false, includeCustom };
	}

	const resolved = (parent.planLicenses ?? [])
		.map((planLicense) => licenseUpsertFromPlanLicense({ planLicense }))
		.filter((entry) => entry != null);

	return {
		upserts: sortLicenseDraftUpserts(resolved.map((entry) => entry.upsert)),
		hasBillingChanges: resolved.some((entry) => entry.hasBillingChanges),
		includeCustom,
	};
};
