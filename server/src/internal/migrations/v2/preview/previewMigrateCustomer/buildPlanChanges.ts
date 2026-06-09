import type { AutumnBillingPlan } from "@autumn/shared";
import { buildPlanChanges as buildBillingUpdatedPlanChanges } from "@/internal/billing/v2/utils/billingChangeResponse/buildPlanChanges.js";
import type { PreviewPlanChange } from "./types/index.js";

export const buildPlanChanges = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): PreviewPlanChange[] =>
	buildBillingUpdatedPlanChanges({
		autumnBillingPlan,
	});
