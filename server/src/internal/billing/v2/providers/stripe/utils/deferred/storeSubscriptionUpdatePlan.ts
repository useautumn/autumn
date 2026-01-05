import { type AppEnv, MetadataType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { generateId } from "@/utils/genUtils";
import type { AutumnBillingPlan } from "../../../../types/billingPlan";

export type DeferredAutumnBillingPlanData = {
	version: 2;
	orgId: string;
	env: AppEnv;
	autumnBillingPlan: AutumnBillingPlan;
};

export const storeSubscriptionUpdatePlan = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<string> => {
	const id = generateId("meta");
	const { db, org, env } = ctx;

	const data: DeferredAutumnBillingPlanData = {
		version: 2,
		orgId: org.id,
		env,
		autumnBillingPlan,
	};

	await MetadataService.insert({
		db,
		data: {
			id,
			type: MetadataType.DeferredAutumnBillingPlan,
			data,
		},
	});

	return id;
};
