import {
	type EntityRolloverBalance,
	type FullCustomerEntitlement,
	type Rollover,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";

export const getRolloverUpdates = ({
	cusEnt,
	nextResetAt,
}: {
	cusEnt: FullCustomerEntitlement;
	nextResetAt: number; // from when we add the rollover expiry duration to calculate the next expiry
}) => {
	const update: {
		toDelete: string[];
		toInsert: Rollover[];
		toUpdate: Rollover[];
	} = {
		toDelete: [],
		toInsert: [],
		toUpdate: [],
	};
	const ent = cusEnt.entitlement;
	const shouldRollover =
		cusEnt.balance && cusEnt.balance > 0 && notNullish(ent.rollover);

	if (!shouldRollover) return update;

	const nextExpiry = calculateNextExpiry(nextResetAt, ent.rollover!);

	const newRollover: Rollover = {
		id: generateId("roll"),
		cus_ent_id: cusEnt.id,
		balance: 0,
		usage: 0,
		expires_at: nextExpiry,
		entities: {},
		created_at: new Date(),
	};

	if (notNullish(ent.entity_feature_id)) {
		for (const entityId in cusEnt.entities) {
			const entRollover = cusEnt.entities[entityId].balance;

			if (entRollover > 0) {
				newRollover.entities[entityId] = {
					id: entityId,
					balance: entRollover,
					usage: 0,
				};
			}
		}

		update.toInsert.push(newRollover);
	} else {
		const balance = cusEnt.balance!;
		if (balance > 0) {
			newRollover.balance = balance;
			update.toInsert.push(newRollover);
		}
	}

	return update;
};

const calculateNextExpiry = (nextResetAt: number, config: RolloverConfig) => {
	if (nullish(config)) {
		return null;
	}

	if (config.duration === RolloverExpiryDurationType.Forever) return null;

	return addMonths(nextResetAt, config.length).getTime();
};

export function performMaximumClearing({
	rows,
	cusEnt,
}: {
	rows: Rollover[];
	cusEnt: FullCustomerEntitlement;
}) {
	const rolloverConfig = cusEnt.entitlement.rollover;

	if (!rolloverConfig) {
		return { toDelete: [], toUpdate: [] };
	}

	if (rolloverConfig.max == null) {
		return { toDelete: [], toUpdate: [] };
	}

	const total = 0;
	const toDelete: string[] = [];
	const toUpdate: Rollover[] = [];

	// look through each row
	// if entityMode is true, then look through each entity
	// otherwise look at balance

	// sort by the oldest first
	// add the balance of the oldest to the total
	// if the total is greater than or equal to the max, then:
	// subtract the max from the total, if theres a difference then instantiate the updated row object and push to toUpdate
	// if theres no difference, then push to toDelete
	// move to the next row
	// if the total is less than the max, then
	// move to the next row

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
		let toDeduct = new Decimal(totalRolloverBalance).sub(rolloverConfig.max);

		if (toDeduct.lt(0)) return { toDelete: [], toUpdate: [] };

		const toUpdate: Rollover[] = [];
		const toDelete: string[] = [];

		for (const row of rows) {
			const curBalance = new Decimal(row.balance);
			let newBalance = curBalance;
			if (curBalance.gte(toDeduct)) {
				newBalance = newBalance.sub(toDeduct);
				toDeduct = new Decimal(0);

				toUpdate.push({ ...row, balance: newBalance.toNumber() });
			} else {
				newBalance = new Decimal(0);
				toDeduct = toDeduct.sub(curBalance);

				toDelete.push(row.id);
			}

			if (toDeduct.lte(0)) break;
		}

		return { toDelete, toUpdate };
	} else {
		const allEntityIds = new Set<string>();
		rows.forEach((row) => {
			if (row.entities && Array.isArray(row.entities)) {
				row.entities.forEach((entity: any) => {
					if (entity.id) {
						allEntityIds.add(entity.id);
					}
				});
			}
		});

		const entityTotals = new Map<string, number>();
		allEntityIds.forEach((id) => {
			entityTotals.set(id, 0);
		});
		const entityIdToTotal: Record<string, number> = {};
		rows.forEach((row) => {
			for (const entityId in row.entities) {
				entityIdToTotal[entityId] =
					(entityIdToTotal[entityId] || 0) + row.entities[entityId].balance;
			}
		});

		const toUpdate: Rollover[] = [];
		const toDelete: string[] = [];

		// Non entity mode
		for (const row of rows) {
			const update = structuredClone(row);
			let shouldUpdate = false;

			for (const entityId in entityIdToTotal) {
				const entityTotal = entityIdToTotal[entityId];
				const toDeduct = new Decimal(entityTotal).sub(rolloverConfig.max);

				if (toDeduct.lte(0) || !row.entities[entityId]) continue;

				const curBalance = new Decimal(row.entities[entityId].balance);
				let newBalance = curBalance;

				if (curBalance.gte(toDeduct)) {
					newBalance = newBalance.sub(toDeduct);
					entityIdToTotal[entityId] = 0;
					shouldUpdate = true;
					update.entities[entityId] = {
						id: entityId,
						balance: newBalance.toNumber(),
						usage: 0,
					};
				} else {
					newBalance = new Decimal(0);
					entityIdToTotal[entityId] = toDeduct.sub(curBalance).toNumber();
					shouldUpdate = true;
					update.entities[entityId] = {
						id: entityId,
						balance: 0,
						usage: 0,
					};
				}
			}
			// If all keys are 0, then delete the row
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
}
