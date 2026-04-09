import type { Customer, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { triggerAutoTopUp } from "./triggerAutoTopUp";

/** Triggers an auto top-up for the first feature that transitions to enabled. */
export const triggerAutoTopUpsOnEnabled = async ({
	ctx,
	oldCustomer,
	fullCustomer,
}: {
	ctx: AutumnContext;
	oldCustomer: Customer;
	fullCustomer: FullCustomer;
}) => {
	for (const autoTopup of fullCustomer.auto_topups || []) {
		if (!autoTopup.enabled) continue;

		const originalAutoTopup = oldCustomer.auto_topups?.find(
			(at) => at.feature_id === autoTopup.feature_id,
		);

		// Only trigger if it didn't exist previously or was disabled
		if (originalAutoTopup?.enabled) continue;

		const feature = ctx.features.find((f) => f.id === autoTopup.feature_id);
		if (!feature) {
			ctx.logger.error(`[triggerAutoTopUpsOnEnabled] Feature not found`, {
				featureId: autoTopup.feature_id,
			});
			continue;
		}

		// Trigger for the first transitioning feature only, to avoid billing lock contention
		await triggerAutoTopUp({
			ctx,
			newFullCus: fullCustomer,
			feature,
		});
		break;
	}
};
