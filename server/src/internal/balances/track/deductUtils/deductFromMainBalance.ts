import {
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	isEntityScopedCusEnt,
} from "@autumn/shared";

export type DeductFromMainBalanceParams = {
	cusEnt: FullCusEntWithFullCusProduct;
	amountToDeduct: number;
	targetEntityId?: string;
	alterGrantedBalance?: boolean;
};

export type DeductFromMainBalanceResult = {
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
	alterGrantedBalance = false,
}: DeductFromMainBalanceParams): DeductFromMainBalanceResult => {
	const hasEntityScope = isEntityScopedCusEnt({ cusEnt });

	const currentBalance = cusEnt.balance ?? 0;
	const currentEntities = cusEnt.entities ?? null;
	const currentAdjustment = cusEnt.adjustment ?? 0;

	// CASE 1: Deduct from top level balance
	// const { deducted, newBalance, newAdjustment, remaining } = calculateDeduction(
	// 	{
	// 		currentBalance,
	// 		currentAdjustment,
	// 		amountToDeduct,
	// 		allowNegative,
	// 		alterGrantedBalance,
	// 	},
	// );
	// return deductFromTopLevelBalance({
	// 	currentBalance,
	// 	currentEntities,
	// 	currentAdjustment,
	// 	amountToDeduct,
	// 	creditCost,
	// 	allowNegative,
	// 	alterGrantedBalance,
	// });
};

// // =============================================================================
// // CASE 3: Deduct from TOP-LEVEL balance
// // =============================================================================
// const deductFromTopLevelBalance = ({
// 	currentBalance,
// 	currentEntities,
// 	currentAdjustment,
// 	amountToDeduct,
// 	creditCost,
// 	allowNegative,
// 	alterGrantedBalance,
// }: {
// 	currentBalance: number;
// 	currentEntities: Record<string, EntityBalance> | null;
// 	currentAdjustment: number;
// 	amountToDeduct: number;
// 	creditCost: number;
// 	allowNegative: boolean;
// 	alterGrantedBalance: boolean;
// }): DeductFromMainBalanceResult => {
// 	const amountInCredits = new Decimal(amountToDeduct)
// 		.mul(creditCost)
// 		.toNumber();

// 	const { deducted, newBalance, newAdjustment } = calculateDeduction({
// 		currentBalance,
// 		currentAdjustment,
// 		amountToDeduct: amountInCredits,
// 		allowNegative,
// 		alterGrantedBalance,
// 	});

// 	return {
// 		deducted,
// 		newBalance,
// 		newEntities: currentEntities, // Entities unchanged for top-level
// 		newAdjustment,
// 		remaining: new Decimal(amountInCredits)
// 			.sub(deducted)
// 			.div(creditCost)
// 			.toNumber(),
// 	};
// };
