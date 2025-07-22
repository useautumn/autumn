import {
	FullCustomerEntitlement,
	ProductItemInterval,
	Rollover,
	RolloverModel,
	EntityBalance,
	EntityRolloverBalance,
} from "@autumn/shared";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { randomUUID } from "crypto";

export const getRolloverUpdates = ({
	cusEnt,
	allowance,
	nextResetAt,
}: {
	cusEnt: FullCustomerEntitlement;
	allowance?: number;
	nextResetAt: number;
}) => {
	let update: {
		toDelete: string[];
		toInsert: RolloverModel[];
		toUpdate: RolloverModel[];
	} = {
		toDelete: [],
		toInsert: [],
		toUpdate: [],
	};

	if (nullish(cusEnt.entitlement.rollover) || !cusEnt.entitlement.rollover) {
		return update;
	}

	let nextExpiry = calculateNextExpiry(
		nextResetAt,
		cusEnt.entitlement.rollover
	);
	if (nullish(nextExpiry) || !nextExpiry) {
		return update;
	}

	let entitlement = cusEnt.entitlement.allowance;

	if (nullish(entitlement) || !entitlement) {
		return update;
	}

	let balance = cusEnt.balance || 0;

	let rollover = entitlement! - balance;
	console.log(
		`Rollover: ${rollover} | Entitlement: ${entitlement} | Balance: ${balance}`
	);

	let newEntitlement = {
		cus_ent_id: cusEnt.id,
		balance: rollover,
		expires_at: nextExpiry,
		entities: [] as EntityRolloverBalance[],
		id: randomUUID() as string,
	};

	console.log("🏢 entities:", cusEnt.entities);
	console.log("📋 entitlement:", cusEnt.entitlement);
	console.log("🆔 entity feature id:", cusEnt.entitlement.entity_feature_id);

	if (notNullish(cusEnt.entitlement.entity_feature_id)) {
		console.log("🔍 newEntities:", cusEnt.entities);
		for (const entityId in cusEnt.entities) {
			let entRollover = entitlement! - cusEnt.entities[entityId].balance;
			if (entRollover > 0) {
				newEntitlement.entities.push({
					id: entityId,
					balance: entRollover,
				});
			}
		}
		update.toInsert.push(newEntitlement);
	} else {
		update.toInsert.push(newEntitlement);
	}

	console.log("Rollover update", update);

	return update;
};

export const calculateNextExpiry = (nextResetAt: number, config: Rollover) => {
	if (nullish(config)) {
		return null;
	}

	let nextExpiry = new Date(nextResetAt);
	if (config!.duration === ProductItemInterval.Month) {
		nextExpiry.setMonth(nextExpiry.getMonth() + config!.length);
	}

	return nextExpiry.getTime();
};
