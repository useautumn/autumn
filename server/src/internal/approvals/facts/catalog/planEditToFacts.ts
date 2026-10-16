import type { CatalogPlanFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

export const planEditToFacts = ({
	planId,
}: {
	planId: string;
}): CatalogPlanFacts => ({ plan_id: planId });
