import {
	cusEntToStartingBalance,
	type EntityRolloverBalance,
	entToOptions,
	type FullCusEntWithFullCusProduct,
	type FullCusEntWithProduct,
	type FullCustomerEntitlement,
	getStartingBalance,
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
		id: generateId("roll"),
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

function hasFullCusProduct(
	cusEnt: FullCusEntWithProduct,
): cusEnt is FullCusEntWithFullCusProduct {
	return (
		cusEnt.customer_product != null &&
		"customer_prices" in cusEnt.customer_product
	);
}

/** Effective rollover cap for a cusEnt: null = unlimited (or no config). */
export const cusEntToEffectiveRolloverMax = ({
	cusEnt,
	startingBalanceOverride,
}: {
	cusEnt: FullCusEntWithProduct;
	startingBalanceOverride?: number;
}): number | null => {
	const rolloverConfig = cusEnt.entitlement.rollover;
	if (!rolloverConfig) return null;

	if (rolloverConfig.max_percentage == null) return rolloverConfig.max ?? null;

	let startingBalance: number;
	if (startingBalanceOverride !== undefined) {
		startingBalance = startingBalanceOverride;
	} else if (hasFullCusProduct(cusEnt)) {
		startingBalance = cusEntToStartingBalance({ cusEnt });
	} else {
		const options = entToOptions({
			ent: cusEnt.entitlement,
			options: cusEnt.customer_product?.options ?? [],
		});
		startingBalance = getStartingBalance({
			entitlement: cusEnt.entitlement,
			options,
			productQuantity: cusEnt.customer_product?.quantity ?? 1,
		});
	}

	return new Decimal(startingBalance)
		.mul(rolloverConfig.max_percentage)
		.div(100)
		.floor()
		.toNumber();
};

export function performMaximumClearing({
	rows,
	cusEnt,
	startingBalanceOverride,
}: {
	rows: Rollover[];
	cusEnt: FullCusEntWithProduct;
	startingBalanceOverride?: number;
}) {
	const rolloverConfig = cusEnt.entitlement.rollover;

	if (!rolloverConfig) {
		return { toDelete: [], toUpdate: [] };
	}

	const effectiveMax = cusEntToEffectiveRolloverMax({
		cusEnt,
		startingBalanceOverride,
	});

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
