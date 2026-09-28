import { Decimal } from "decimal.js";
import type {
	EntityRolloverBalance,
	Rollover,
} from "../../../models/cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import {
	cusEntToEffectiveRolloverMax,
	type RolloverMaxCustomerEntitlement,
} from "./cusEntToEffectiveRolloverMax.js";

export function performMaximumClearing({
	rows,
	cusEnt,
}: {
	rows: Rollover[];
	cusEnt: RolloverMaxCustomerEntitlement;
}) {
	const rolloverConfig = cusEnt.entitlement.rollover;

	if (!rolloverConfig) {
		return { toDelete: [], toUpdate: [] };
	}

	const effectiveMax = cusEntToEffectiveRolloverMax({ cusEnt });

	if (effectiveMax == null) {
		return { toDelete: [], toUpdate: [] };
	}

	rows.sort((a, b) => {
		if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
		if (a.expires_at && !b.expires_at) return -1;
		if (!a.expires_at && b.expires_at) return 1;
		return 0;
	});

	const ent = cusEnt.entitlement;
	const entityMode = !!ent.entity_feature_id;

	if (!entityMode) {
		const totalRolloverBalance = rows.reduce(
			(acc, row) => acc + row.balance,
			0,
		);
		let toDeduct = new Decimal(totalRolloverBalance).sub(effectiveMax);

		if (toDeduct.lt(0)) return { toDelete: [], toUpdate: [] };

		const toUpdate: Rollover[] = [];
		const toDelete: string[] = [];

		for (const row of rows) {
			const curBalance = new Decimal(row.balance);
			let newBalance = curBalance;
			if (curBalance.gte(toDeduct)) {
				newBalance = newBalance.sub(toDeduct);
				toDeduct = new Decimal(0);

				// Drop fully-drained rows instead of keeping zero-balance zombies.
				if (newBalance.isZero()) {
					toDelete.push(row.id);
				} else {
					toUpdate.push({ ...row, balance: newBalance.toNumber() });
				}
			} else {
				newBalance = new Decimal(0);
				toDeduct = toDeduct.sub(curBalance);

				toDelete.push(row.id);
			}

			if (toDeduct.lte(0)) break;
		}

		return { toDelete, toUpdate };
	}

	const entityIdToTotal: Record<string, number> = {};
	rows.forEach((row) => {
		for (const entityId in row.entities) {
			entityIdToTotal[entityId] =
				(entityIdToTotal[entityId] || 0) + row.entities[entityId].balance;
		}
	});

	const toUpdate: Rollover[] = [];
	const toDelete: string[] = [];

	for (const row of rows) {
		const update = structuredClone(row);
		let shouldUpdate = false;

		for (const entityId in entityIdToTotal) {
			const entityTotal = entityIdToTotal[entityId];
			const toDeduct = new Decimal(entityTotal).sub(effectiveMax);

			if (toDeduct.lte(0) || !row.entities[entityId]) continue;

			const curBalance = new Decimal(row.entities[entityId].balance);
			let newBalance = curBalance;

			if (curBalance.gte(toDeduct)) {
				newBalance = newBalance.sub(toDeduct);
				// Remaining running total after the full deduction (== effectiveMax),
				// keeping the same invariant as the else-branch below.
				entityIdToTotal[entityId] = entityTotal - toDeduct.toNumber();
				shouldUpdate = true;
				update.entities[entityId] = {
					id: entityId,
					balance: newBalance.toNumber(),
					usage: 0,
				};
			} else {
				newBalance = new Decimal(0);
				// Carry the remaining running total (not the residual deduction) so
				// the next row recomputes toDeduct correctly.
				entityIdToTotal[entityId] = entityTotal - curBalance.toNumber();
				shouldUpdate = true;
				update.entities[entityId] = {
					id: entityId,
					balance: 0,
					usage: 0,
				};
			}
		}
		if (
			Object.values(update.entities).every(
				(entity: EntityRolloverBalance) => entity.balance === 0,
			)
		) {
			toDelete.push(row.id);
		} else if (shouldUpdate) {
			toUpdate.push(update);
		}
	}

	return { toDelete, toUpdate };
}
