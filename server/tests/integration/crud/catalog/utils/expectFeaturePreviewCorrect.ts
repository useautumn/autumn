import { expect } from "bun:test";
import type {
	CatalogFeaturePreview,
	CatalogPreviewUpdateResponse,
	FeatureType,
	FeatureUpdateBlockerCode,
} from "@autumn/shared";

/**
 * Assert the per-feature slice of a catalog.preview_update response. Only the
 * fields you pass are checked. `blockerCodes` is a contains-check (extra
 * blockers from shared-org usage are tolerated); `noBlockers` is exact-empty.
 */
export const expectFeaturePreviewCorrect = ({
	preview,
	featureId,
	type,
	blockerCodes,
	noBlockers,
}: {
	preview: CatalogPreviewUpdateResponse;
	featureId: string;
	type?: FeatureType;
	blockerCodes?: FeatureUpdateBlockerCode[];
	noBlockers?: boolean;
}): CatalogFeaturePreview => {
	const result = preview.features.find(
		(feature) => feature.feature.id === featureId,
	);
	expect(result, `No feature preview for ${featureId}`).toBeDefined();
	const featurePreview = result as CatalogFeaturePreview;

	if (typeof type !== "undefined") {
		expect(featurePreview.feature.type, `feature type for ${featureId}`).toBe(
			type,
		);
	}

	if (noBlockers) {
		expect(
			featurePreview.blockers,
			`expected no blockers for ${featureId}`,
		).toEqual([]);
	}

	if (blockerCodes) {
		const codes = featurePreview.blockers.map((blocker) => blocker.code);
		for (const code of blockerCodes) {
			expect(
				codes,
				`blocker ${code} for ${featureId}: got ${JSON.stringify(featurePreview.blockers)}`,
			).toContain(code);
		}
	}

	return featurePreview;
};
