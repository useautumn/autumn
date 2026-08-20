import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService";

export const applyFreeTrialPlan = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	const plan = upsert.freeTrialPlan;
	if (!plan) return;

	if (plan.new) {
		await FreeTrialService.insert({ db: ctx.db, data: plan.new });
	}

	if (plan.retired) {
		await FreeTrialService.update({
			db: ctx.db,
			freeTrialId: plan.retired.id,
			update: { is_custom: true },
		});
	}
};
