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

export const queueDeductionSideEffect = ({
	sideEffect,
	sideEffects,
}: {
	sideEffect: DeductionSideEffect;
	sideEffects: DeductionSideEffect[];
}) => {
	sideEffects.push({
		...sideEffect,
		newFullCus: structuredClone(sideEffect.newFullCus),
	});
};

/**
 * Drops queued side effects for a feature whose deduction was compensated:
 * the balance change they describe was reversed, so firing them would report
 * a drop that no longer exists. Cascade legs always have distinct feature
 * ids, so matching by feature id only removes the compensated leg's entry.
 */
export const removeDeductionSideEffectsForFeature = ({
	sideEffects,
	featureId,
}: {
	sideEffects: DeductionSideEffect[];
	featureId: string;
}) => {
	const retained = sideEffects.filter(
		(sideEffect) => sideEffect.feature.id !== featureId,
	);
	if (retained.length === sideEffects.length) return;
	sideEffects.length = 0;
	sideEffects.push(...retained);
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
