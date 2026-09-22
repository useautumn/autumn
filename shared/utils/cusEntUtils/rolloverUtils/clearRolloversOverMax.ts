import type { Rollover } from "../../../models/cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import type { RolloverMaxCustomerEntitlement } from "./cusEntToEffectiveRolloverMax.js";
import { performMaximumClearing } from "./performMaximumClearing.js";

/** The rows a reset writes once the cap is applied over the row's rollovers and the ones it just carried over. */
export type RolloverResetWrites = {
	inserts: Rollover[];
	updates: Rollover[];
	deleteIds: string[];
};

/** A carried-over row trimmed by the cap is inserted trimmed; one drained by it is never inserted. */
export const clearRolloversOverMax = ({
	cusEnt,
	newRollovers,
}: {
	cusEnt: RolloverMaxCustomerEntitlement & { rollovers: Rollover[] };
	newRollovers: Rollover[];
}): RolloverResetWrites => {
	if (newRollovers.length === 0) {
		return { inserts: [], updates: [], deleteIds: [] };
	}

	const { toDelete, toUpdate } = performMaximumClearing({
		rows: [...cusEnt.rollovers, ...newRollovers],
		cusEnt,
	});

	const newRolloverIds = new Set(newRollovers.map(({ id }) => id));
	const deletedRolloverIds = new Set(toDelete);
	const updatedRolloversById = new Map(
		toUpdate.map((rollover) => [rollover.id, rollover]),
	);

	return {
		inserts: newRollovers
			.filter(({ id }) => !deletedRolloverIds.has(id))
			.map((rollover) => updatedRolloversById.get(rollover.id) ?? rollover),
		updates: toUpdate.filter(({ id }) => !newRolloverIds.has(id)),
		deleteIds: toDelete.filter((id) => !newRolloverIds.has(id)),
	};
};
