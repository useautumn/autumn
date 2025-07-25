import { logger } from "@/external/logtail/logtailUtils.js";
import {
	DeductParams,
	RolloverDeductParams,
} from "@/trigger/updateBalanceTask.js";
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
	let start = performance.now();
	let updates = {
		toInsert: [] as Rollover[],
		toUpdate: [] as Rollover[],
	};
	let rollovers = getSortedRollovers({
		cusEnts: [cusEnt],
		featureId: deductParams.feature.id,
		entityId: deductParams.entity?.id,
	});

    console.log(`rollovers: ${JSON.stringify(rollovers)}`);

	if (deductParams.entity) {
		console.log(
			`Processing entity-specific rollover deduction for entity ${deductParams.entity.id}, toDeduct: ${toDeduct}`
		);
		for(let rollover of rollovers) {
			console.log(
				`Processing rollover ${rollover.id} for entity ${deductParams.entity.id} with balance ${rollover.balance}, usage ${rollover.usage}, expires_at ${rollover.expires_at}, toDeduct remaining: ${toDeduct}`
			);
			let entityRollover = rollover.entities[deductParams.entity.id];
			if(entityRollover) {
				console.log(
					`Found entity rollover for entity ${deductParams.entity.id}: balance ${entityRollover.balance}, usage ${entityRollover.usage}`
				);
				if(entityRollover.balance >= toDeduct) {
					console.log(
						`Entity rollover has sufficient balance (${entityRollover.balance}) to cover remaining deduction (${toDeduct})`
					);
					entityRollover.balance -= toDeduct;
					entityRollover.usage += toDeduct;
					console.log(
						`Updated entity rollover: new balance ${entityRollover.balance}, new usage ${entityRollover.usage}`
					);
					console.log(
						`Updated rollover ${rollover.id}: new balance ${rollover.balance}, new usage ${rollover.usage}`
					);
					updates.toUpdate.push(rollover);
					toDeduct = 0;
					console.log(
						`Entity deduction complete. Remaining toDeduct: ${toDeduct}`
					);
					break;
				} else {
					if(entityRollover.balance > 0) {
						console.log(
							`Entity rollover has insufficient balance (${entityRollover.balance}) for full deduction (${toDeduct}). Using all available balance.`
						);
						let deductedAmount = entityRollover.balance;
						toDeduct -= entityRollover.balance;
						entityRollover.balance = 0;
						entityRollover.usage += deductedAmount;
						console.log(
							`Updated entity rollover: new balance ${entityRollover.balance}, new usage ${entityRollover.usage}`
						);
						console.log(
							`Updated rollover ${rollover.id}: new balance ${rollover.balance}, new usage ${rollover.usage}. Remaining toDeduct: ${toDeduct}`
						);
						updates.toUpdate.push(rollover);
					} else {
						console.log(
							`Entity rollover has zero balance, skipping`
						);
					}
				}
			} else {
				console.log(
					`No entity rollover found for entity ${deductParams.entity.id} in rollover ${rollover.id}`
				);
			}
		}
	} else {
		for (let rollover of rollovers) {
			console.log(
				`Processing rollover ${rollover.id} with balance ${rollover.balance}, usage ${rollover.usage}, expires_at ${rollover.expires_at}, toDeduct remaining: ${toDeduct}`
			);

			if (rollover.balance >= toDeduct) {
				console.log(
					`Rollover ${rollover.id} has sufficient balance (${rollover.balance}) to cover remaining deduction (${toDeduct})`
				);
				rollover = {
					...rollover,
					balance: rollover.balance - toDeduct,
					usage: rollover.usage + toDeduct,
				};
				console.log(
					`Updated rollover ${rollover.id}: new balance ${rollover.balance}, new usage ${rollover.usage}`
				);
				updates.toUpdate.push(rollover);
				toDeduct = 0;
				console.log(
					`Deduction complete. Remaining toDeduct: ${toDeduct}`
				);
				break;
			} else {
				if (rollover.balance > 0) {
					console.log(
						`Rollover ${rollover.id} has insufficient balance (${rollover.balance}) for full deduction (${toDeduct}). Using all available balance.`
					);
					toDeduct -= rollover.balance;
					rollover = {
						...rollover,
						usage: rollover.usage + rollover.balance,
						balance: 0,
					};
					console.log(
						`Updated rollover ${rollover.id}: new balance ${rollover.balance}, new usage ${rollover.usage}. Remaining toDeduct: ${toDeduct}`
					);
					updates.toUpdate.push(rollover);
				} else {
					console.log(
						`Rollover ${rollover.id} has zero balance, skipping`
					);
				}
			}
		}
	}

	let dbResp = await RolloverService.bulkUpdate({
		db: deductParams.db,
		rows: updates.toUpdate,
	});
	console.log(`dbResp: ${JSON.stringify(dbResp)}`);

	let end = performance.now();
	console.log(
		`deductFromCusRollovers took ${end - start}ms for ${toDeduct} toDeduct out of ${rollovers.length} rollovers`
	);

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
				if (a.expires_at && b.expires_at)
					return a.expires_at - b.expires_at;
				if (a.expires_at && !b.expires_at) return -1;
				if (!a.expires_at && b.expires_at) return 1;
				return 0;
			});
	else {
		return cusEnts
			.filter((cusEnt) => {
				return cusEnt.feature_id === featureId && cusEnt.entities && cusEnt.entities[entityId];
			})
			.flatMap((cusEnt) => {
				return cusEnt.rollovers.filter(x => {
                    return x.entities[entityId]
                });
			})
			.sort((a, b) => {
				if (a.expires_at && b.expires_at)
					return a.expires_at - b.expires_at;
				if (a.expires_at && !b.expires_at) return -1;
				if (!a.expires_at && b.expires_at) return 1;
				return 0;
			});
	}
};