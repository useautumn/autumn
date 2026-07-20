import type { PlanUpdatePreview } from "@autumn/shared";

export const previewHasLicenseParentTargets = (
	preview: Pick<PlanUpdatePreview, "license_parents">,
) => preview.license_parents.length > 0;

export const previewHasVersionableTargets = (
	preview: Pick<
		PlanUpdatePreview,
		"license_parents" | "variants" | "versionable"
	>,
) =>
	preview.versionable ||
	preview.variants.some((variant) => variant.versionable) ||
	preview.license_parents.some((parent) => parent.versionable);
