import {
	cusEntToMinBalance,
	cusEntToUsageAllowed,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	isEntityScopedCusEnt,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { cusEntToStartingBalance } from "../../../../../../shared/utils/cusEntUtils/balanceUtils/cusEntToStartingBalance";
import { calculateDeduction } from "./calculateDeduction";

type DeductFromMainBalanceParams = {
	cusEnt: FullCusEntWithFullCusProduct;
	amountToDeduct: number;
	targetEntityId?: string;
	alterGrantedBalance?: boolean;
	minBalance?: number;
	maxBalance?: number;
};

type DeductFromMainBalanceResult = {
	deducted: number;
	newBalance: number;
	newEntities: Record<string, EntityBalance> | null;
	newAdjustment: number;
	remaining: number;
};

/**
 * Deducts from the main balance of a customer entitlement.
 * Handles three cases:
 * 1. Entity-scoped, all entities - loops through all entities
 * 2. Entity-scoped, single entity - deducts from specific entity
 * 3. Top-level balance - deducts from cusEnt.balance
 */
export const deductFromMainBalance = ({
	cusEnt,
	amountToDeduct,
	targetEntityId,
	minBalance,
	alterGrantedBalance = false,
}: DeductFromMainBalanceParams): DeductFromMainBalanceResult => {
	minBalance = minBalance ?? cusEntToMinBalance({ cusEnt }); // If minBalance is not provided, use the min balance from the cusEnt
	const usageAllowed = cusEntToUsageAllowed({ cusEnt });

	const currentTopLevelBalance = cusEnt.balance ?? 0;
	const currentTopLevelAdjustment = cusEnt.adjustment ?? 0;
	const currentEntities = cusEnt.entities ?? null;

	const baseMaxBalance = cusEntToStartingBalance({ cusEnt });

	minBalance = usageAllowed !== true ? 0 : minBalance;

	if (targetEntityId || isEntityScopedCusEnt(cusEnt)) {
		// CASE 1: ENTITY SCOPED, SINGLE ENTITY
		if (targetEntityId) {
			const entity = currentEntities?.[targetEntityId];
			if (entity) {
				const entityBalance = entity.balance ?? 0;
				const entityAdjustment = entity.adjustment ?? 0;
				const maxBalance = new Decimal(baseMaxBalance)
					.add(entityAdjustment)
					.toNumber();

				const { deducted, newBalance, newAdjustment, remaining } =
					calculateDeduction({
						currentBalance: entityBalance,
						currentAdjustment: entityAdjustment,
						amountToDeduct,
						alterGrantedBalance,
						minBalance,
						maxBalance,
					});

				const newEntities = {
					...currentEntities,
					[targetEntityId]: {
						id: targetEntityId,
						balance: newBalance,
						adjustment: newAdjustment,
						additional_balance: 0,
					},
				};

				return {
					deducted,
					newBalance,
					newEntities,
					newAdjustment,
					remaining,
				};
			}

			return {
				deducted: 0,
				newBalance: currentTopLevelBalance,
				newEntities: currentEntities,
				newAdjustment: currentTopLevelAdjustment,
				remaining: amountToDeduct,
			};
		} else {
			// CASE 2: ENTITY SCOPED, ALL ENTITIES
			const newEntities: Record<string, EntityBalance> = { ...currentEntities };
			for (const entityId in currentEntities) {
				if (amountToDeduct === 0) break;

				const entity = currentEntities[entityId];
				const entityBalance = entity.balance ?? 0;
				const entityAdjustment = entity.adjustment ?? 0;
				const maxBalance = new Decimal(baseMaxBalance)
					.add(entityAdjustment)
					.toNumber();

				const { newBalance, newAdjustment, remaining } = calculateDeduction({
					currentBalance: entityBalance,
					currentAdjustment: entityAdjustment,
					amountToDeduct,
					alterGrantedBalance,
					minBalance,
					maxBalance,
				});

				amountToDeduct = remaining;

				newEntities[entityId] = {
					...entity,
					balance: newBalance,
					adjustment: newAdjustment,
				};
			}

			return {
				deducted: amountToDeduct,
				newBalance: currentTopLevelBalance,
				newAdjustment: currentTopLevelAdjustment,
				newEntities,
				remaining: amountToDeduct,
			};
		}
	}

	// CASE 3: TOP-LEVEL BALANCE
	const maxBalance = new Decimal(baseMaxBalance)
		.add(currentTopLevelAdjustment)
		.toNumber();

	const { deducted, newBalance, newAdjustment, remaining } = calculateDeduction(
		{
			currentBalance: currentTopLevelBalance,
			currentAdjustment: currentTopLevelAdjustment,
			amountToDeduct,
			alterGrantedBalance,
			minBalance,
			maxBalance,
		},
	);

	return {
		deducted,
		newBalance,
		newEntities: currentEntities,
		newAdjustment,
		remaining,
	};
};
