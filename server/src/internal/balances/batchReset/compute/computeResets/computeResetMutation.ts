import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { processReset } from "@/internal/customers/actions/resetCustomerEntitlements/processReset.js";
import { performMaximumClearing } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils.js";
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

	const newRollovers = result.rolloverInsert?.rows ?? [];
	if (newRollovers.length === 0) {
		return {
			customerEntitlementId: customerEntitlement.id,
			expectedNextResetAt,
			updates: result.updates,
			rolloverInserts: [],
			rolloverUpdates: [],
			rolloverDeleteIds: [],
		};
	}

	const { toDelete, toUpdate } = performMaximumClearing({
		rows: [...customerEntitlement.rollovers, ...newRollovers],
		cusEnt: customerEntitlement,
	});

	const newRolloverIds = new Set(newRollovers.map(({ id }) => id));
	const deletedRolloverIds = new Set(toDelete);
	const updatedRolloversById = new Map(
		toUpdate.map((rollover) => [rollover.id, rollover]),
	);

	return {
		customerEntitlementId: customerEntitlement.id,
		expectedNextResetAt,
		updates: result.updates,
		rolloverInserts: newRollovers
			.filter(({ id }) => !deletedRolloverIds.has(id))
			.map((rollover) => updatedRolloversById.get(rollover.id) ?? rollover),
		rolloverUpdates: toUpdate.filter(({ id }) => !newRolloverIds.has(id)),
		rolloverDeleteIds: toDelete.filter((id) => !newRolloverIds.has(id)),
	};
};
