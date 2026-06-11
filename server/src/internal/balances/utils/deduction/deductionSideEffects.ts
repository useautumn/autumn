import type { Feature, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "@/internal/balances/autoTopUp/triggerAutoTopUp.js";
import { fireTrackWebhooks } from "../../trackWebhooks/fireTrackWebhooks.js";

export type DeductionSideEffect = {
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
	featuresFromMutationLogs?: Feature[];
	triggerAutoTopUp: boolean;
};

export const flushDeductionSideEffects = ({
	ctx,
	sideEffects,
	source,
}: {
	ctx: AutumnContext;
	sideEffects: DeductionSideEffect[];
	source: string;
}) => {
	for (const sideEffect of sideEffects) {
		fireTrackWebhooks({
			ctx,
			oldFullCus: sideEffect.oldFullCus,
			newFullCus: sideEffect.newFullCus,
			feature: sideEffect.feature,
			entityId: sideEffect.entityId,
			featuresFromMutationLogs: sideEffect.featuresFromMutationLogs,
		});

		if (!sideEffect.triggerAutoTopUp) continue;

		triggerAutoTopUp({
			ctx,
			newFullCus: sideEffect.newFullCus,
			feature: sideEffect.feature,
		}).catch((error) => {
			ctx.logger.error(`[${source}] Failed to trigger auto top-up: ${error}`);
		});
	}
};
