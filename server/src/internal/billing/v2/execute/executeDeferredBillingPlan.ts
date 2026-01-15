import type { Metadata } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import type { DeferredAutumnBillingPlanData } from "@/internal/billing/v2/types/billingPlan";
import { MetadataService } from "@/internal/metadata/MetadataService";

export const executeDeferredBillingPlan = async ({
	ctx,
	metadata,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
}) => {
	const { db } = ctx;
	const data = metadata.data as DeferredAutumnBillingPlanData;

	if (data.orgId !== ctx.org.id || data.env !== ctx.env) return;

	const { billingPlan, billingContext, resumeAfter } = data;

	// Execute stripe billing plan
	await executeStripeBillingPlan({
		ctx,
		billingPlan,
		billingContext,
		resumeAfter,
	});

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	await MetadataService.delete({ db, id: metadata.id });
};
