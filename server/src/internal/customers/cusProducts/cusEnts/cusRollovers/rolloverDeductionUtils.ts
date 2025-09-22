import { RolloverDeductParams } from "@/trigger/updateBalanceTask.js";
import { FullCusEntWithFullCusProduct, Rollover } from "@autumn/shared";
import { RolloverService } from "./RolloverService.js";

export const deductFromCusRollovers = async ({
	toDeduct,
	deductParams,
	cusEnt,
}: {
	toDeduct: number;
	deductParams: RolloverDeductParams;
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	if (toDeduct == 0) {
		return toDeduct;
	}

	let updates = {
		toInsert: [] as Rollover[],
		toUpdate: [] as Rollover[],
	};
	let rollovers = getSortedRollovers({
		cusEnts: [cusEnt],
		featureId: deductParams.feature.id,
		entityId: deductParams.entity?.id,
	});

	if (deductParams.entity) {
		for (let rollover of rollovers) {
			let entityRollover = rollover.entities[deductParams.entity.id];
			if (entityRollover) {
				if (entityRollover.balance >= toDeduct) {
					entityRollover.balance -= toDeduct;
					entityRollover.usage += toDeduct;

					updates.toUpdate.push(rollover);
					toDeduct = 0;
					break;
				} else {
					if (entityRollover.balance > 0) {
						let deductedAmount = entityRollover.balance;
						toDeduct -= entityRollover.balance;
						entityRollover.balance = 0;
						entityRollover.usage += deductedAmount;
						updates.toUpdate.push(rollover);
					}
				}
			}
		}
	} else {
		for (let rollover of rollovers) {
			if (rollover.balance >= toDeduct) {
				rollover = {
					...rollover,
					balance: rollover.balance - toDeduct,
					usage: rollover.usage + toDeduct,
				};

				updates.toUpdate.push(rollover);
				toDeduct = 0;

				break;
			} else {
				if (rollover.balance > 0) {
					toDeduct -= rollover.balance;
					rollover = {
						...rollover,
						usage: rollover.usage + rollover.balance,
						balance: 0,
					};

					updates.toUpdate.push(rollover);
				}
			}
		}
	}

	await RolloverService.upsert({
		db: deductParams.db,
		rows: updates.toUpdate,
	});

	return toDeduct;
};

export const getSortedRollovers = ({
	cusEnts,
	featureId,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	featureId: string;
	entityId?: string;
}) => {
	if (!entityId)
		return cusEnts
			.filter((cusEnt) => {
				return cusEnt.feature_id === featureId;
			})
			.flatMap((cusEnt) => {
				return cusEnt.rollovers;
			})
			.sort((a, b) => {
				if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
				if (a.expires_at && !b.expires_at) return -1;
				if (!a.expires_at && b.expires_at) return 1;
				return 0;
			});
	else {
		return cusEnts
			.filter((cusEnt) => {
				return (
					cusEnt.feature_id === featureId &&
					cusEnt.entities &&
					cusEnt.entities[entityId]
				);
			})
			.flatMap((cusEnt) => {
				return cusEnt.rollovers.filter((x) => {
					return x.entities[entityId];
				});
			})
			.sort((a, b) => {
				if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
				if (a.expires_at && !b.expires_at) return -1;
				if (!a.expires_at && b.expires_at) return 1;
				return 0;
			});
	}
};
