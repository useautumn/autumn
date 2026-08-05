import type { InsertCustomerEntitlement } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateSubjectBalanceCache } from "@/internal/customers/cusProducts/cusEnts/actions/cache/updateSubjectBalanceCache.js";
import { CusEntService } from "../CusEntitlementService.js";

/**
 * Updates a cusEnt in both Postgres and the FullSubject balance cache.
 */
export const updateCusEntDbAndCache = async ({
	ctx,
	customerId,
	cusEntId,
	updates,
	incrementCacheVersion = false,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	cusEntId: string;
	updates: Partial<InsertCustomerEntitlement>;
	incrementCacheVersion?: boolean;
	featureId: string;
}): Promise<void> => {
	await CusEntService.update({
		ctx,
		id: cusEntId,
		updates,
		incrementCacheVersion,
	});

	await updateSubjectBalanceCache({
		ctx,
		customerId,
		featureId,
		customerEntitlementId: cusEntId,
		updates: {
			balance: updates.balance,
			additional_balance: updates.additional_balance,
			adjustment: updates.adjustment,
			entities: updates.entities,
			reset_cycle_anchor: updates.reset_cycle_anchor,
			next_reset_at: updates.next_reset_at,
		},
	});
};
