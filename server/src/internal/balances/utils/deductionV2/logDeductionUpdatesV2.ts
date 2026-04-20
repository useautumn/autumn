import {
	type FullSubject,
	findCustomerEntitlementById,
	fullSubjectToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

/** Logs deduction updates with customer entitlement details (FullSubject version). */
export const logDeductionUpdatesV2 = ({
	ctx,
	fullSubject,
	updates,
	source,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
	source?: string;
}): void => {
	if (Object.keys(updates).length === 0) return;

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
	});

	for (const [customerEntitlementId, update] of Object.entries(updates)) {
		const customerEntitlement = findCustomerEntitlementById({
			cusEnts: customerEntitlements,
			id: customerEntitlementId,
		});

		const featureId = customerEntitlement?.entitlement.feature.id ?? "unknown";
		const entityScope = customerEntitlement?.entitlement.entity_feature_id
			? "entity"
			: "customer";

		ctx.logger.info(`[${source}] Deduction updates:`, {
			data2: {
				cusEntId: customerEntitlementId,
				featureId,
				entityScope,
				balance: update.balance,
				adjustment: update.adjustment,
				entities: update.entities,
			},
		});
	}
};
