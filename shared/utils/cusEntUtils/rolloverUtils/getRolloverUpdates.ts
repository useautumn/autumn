import { generateKsuid } from "@autumn/ksuid";
import { addMonths } from "date-fns";
import type { CustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Rollover } from "../../../models/cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import { RolloverExpiryDurationType } from "../../../models/productModels/durationTypes/rolloverExpiryDurationType.js";
import type { Entitlement } from "../../../models/productModels/entModels/entModels.js";
import type { RolloverConfig } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { notNullish, nullish } from "../../utils.js";

/** What carrying a balance over reads: the balances left on the row and the grant's rollover terms. */
export type RolloverUpdatesCustomerEntitlement = Pick<
	CustomerEntitlement,
	"id" | "balance" | "entities"
> & {
	entitlement: Pick<Entitlement, "entity_feature_id" | "rollover">;
};

export const getRolloverUpdates = ({
	cusEnt,
	nextResetAt,
}: {
	cusEnt: RolloverUpdatesCustomerEntitlement;
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
	const hasEntityBalanceToRollover =
		notNullish(ent.entity_feature_id) &&
		Object.values(cusEnt.entities ?? {}).some((entity) => entity.balance > 0);
	const hasBalanceToRollover = notNullish(ent.entity_feature_id)
		? hasEntityBalanceToRollover
		: cusEnt.balance != null && cusEnt.balance > 0;
	const shouldRollover = hasBalanceToRollover && notNullish(ent.rollover);

	if (!shouldRollover) return update;

	const nextExpiry = calculateNextExpiry(nextResetAt, ent.rollover!);

	const newRollover: Rollover = {
		id: generateKsuid({ prefix: "roll_" }),
		cus_ent_id: cusEnt.id,
		balance: 0,
		usage: 0,
		expires_at: nextExpiry,
		entities: {},
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
