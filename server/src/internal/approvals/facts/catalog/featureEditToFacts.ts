import type { CatalogFeatureFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

export const featureEditToFacts = ({
	featureId,
}: {
	featureId: string;
}): CatalogFeatureFacts => ({ feature_id: featureId });
