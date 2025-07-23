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
	nextResetAt
}: {
	cusEnt: FullCustomerEntitlement;
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

	let entitlement = cusEnt.entitlement.allowance ?? 0;

	if (entitlement < 0) {
		return update;
	}

	let rollover = cusEnt.balance || 0;
	console.log(
		`🔥 Unused balance (rollover): ${rollover} | Entitlement: ${entitlement}`
	);

	let newEntitlement = {
		cus_ent_id: cusEnt.id,
		balance: 0,
		expires_at: nextExpiry,
		entities: [] as EntityRolloverBalance[],
		id: randomUUID() as string,
	};

	if (cusEnt.entities != null)
		console.log(
			"🏢 entities:",
			Object.values(cusEnt.entities).map((x: any) => `${x.id}: ${x.balance}`)
		);
	else console.log("🏢 entities: none");
	console.log(
		"📋 entitlement:",
		cusEnt.entitlement.feature_id,
		"| 🆔 entity_feature_id:",
		cusEnt.entitlement.entity_feature_id,
		"| allowance:",
		cusEnt.entitlement.allowance
	);

	if (notNullish(cusEnt.entitlement.entity_feature_id)) {
		console.log("🔍 newEntities:", cusEnt.entities);
		for (const entityId in cusEnt.entities) {
			let entRollover = cusEnt.entities[entityId].balance;
			if (entRollover > 0) {
				newEntitlement.entities.push({
					id: entityId,
					balance: entRollover,
				});
				console.log("🔍 entityId:", entityId, "entRollover:", entRollover);
			} else console.log("🔍 no rollover for entityId:", entityId, " | entitlement:", entitlement, " | balance:", cusEnt.entities[entityId].balance);
		}
		update.toInsert.push(newEntitlement);
	} else {
		if (rollover > 0) {
			newEntitlement.balance = rollover;
			update.toInsert.push(newEntitlement);
		} else console.log("🔍 no rollover for entitlement: ", cusEnt.id, " | rollable balance:", rollover);
	}

	console.log(
		"Rollover update sending from rolloverUtils:",
		update.toInsert.map((rollover) => ({
			id: rollover.id,
			balance: rollover.balance,
			entities: rollover.entities.map((entity) => `${entity.id}: ${entity.balance}`).join(", "),
			expires_at: rollover.expires_at ? new Date(rollover.expires_at).toISOString() : null,
		}))
	);

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
