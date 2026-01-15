import {
	fullCustomerToCustomerEntitlements,
	type FullCustomer,
	findCustomerEntitlementById,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

/**
 * Logs deduction updates with customer entitlement details.
 */
export const logDeductionUpdates = ({
	ctx,
	fullCustomer,
	updates,
	source,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	updates: Record<string, DeductionUpdate>;
	source?: string;
}): void => {
	if (Object.keys(updates).length === 0) return;

	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
	});

	for (const [cusEntId, update] of Object.entries(updates)) {
		const cusEnt = findCustomerEntitlementById({
			cusEnts: customerEntitlements,
			id: cusEntId,
		});

		const featureId = cusEnt?.entitlement.feature.id ?? "unknown";
		const entityScope = cusEnt?.entitlement.entity_feature_id
			? "entity"
			: "customer";

		ctx.logger.info(`[${source}] Deduction updates:`, {
			data2: {
				cusEntId,
				featureId,
				entityScope,
				balance: update.balance,
				adjustment: update.adjustment,
				entities: update.entities,
			},
		});
	}
};
