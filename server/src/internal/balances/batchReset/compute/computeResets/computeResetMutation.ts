import { clearRolloversOverMax } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { processReset } from "@/internal/customers/actions/resetCustomerEntitlements/processReset.js";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type { ResetMutation } from "../../types.js";

export const computeResetMutation = async ({
	ctx,
	customerEntitlement,
}: {
	ctx: AutumnContext;
	customerEntitlement: ResetContextCustomerEntitlement;
}): Promise<ResetMutation | null> => {
	// Guaranteed non-null by the not_due classification; re-checked for the
	// optimistic guard the execute UPDATE compares against.
	const expectedNextResetAt = customerEntitlement.next_reset_at;
	if (expectedNextResetAt == null) return null;

	const result = await processReset({
		ctx,
		cusEnt: customerEntitlement,
	});

	if (!result) return null;

	const { inserts, updates, deleteIds } = clearRolloversOverMax({
		cusEnt: customerEntitlement,
		newRollovers: result.rolloverInsert?.rows ?? [],
	});

	return {
		customerEntitlementId: customerEntitlement.id,
		expectedNextResetAt,
		updates: result.updates,
		rolloverInserts: inserts,
		rolloverUpdates: updates,
		rolloverDeleteIds: deleteIds,
	};
};
