// // =============================================================================
// // CASE 1: Deduct from ALL entities
// // =============================================================================
// const deductFromAllEntities = ({
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
// 	let remaining = new Decimal(amountToDeduct).mul(creditCost).toNumber();
// 	let totalDeducted = 0;
// 	const newEntities: Record<string, EntityBalance> = structuredClone(
// 		currentEntities ?? {},
// 	);

// 	// Sort entity keys for consistency (matches SQL ORDER BY)
// 	const sortedEntityKeys = Object.keys(newEntities).sort();

// 	for (const entityKey of sortedEntityKeys) {
// 		if (remaining === 0) break;

// 		const entityBalance = newEntities[entityKey]?.balance ?? 0;
// 		const entityAdjustment = newEntities[entityKey]?.adjustment ?? 0;

// 		const { deducted, newBalance, newAdjustment } = calculateDeduction({
// 			currentBalance: entityBalance,
// 			currentAdjustment: entityAdjustment,
// 			amountToDeduct: remaining,
// 			allowNegative,
// 			alterGrantedBalance,
// 		});

// 		if (deducted !== 0) {
// 			newEntities[entityKey] = {
// 				...newEntities[entityKey],
// 				balance: newBalance,
// 				adjustment: newAdjustment,
// 			};

// 			remaining = new Decimal(remaining).sub(deducted).toNumber();
// 			totalDeducted = new Decimal(totalDeducted).add(deducted).toNumber();
// 		}
// 	}

// 	return {
// 		deducted: totalDeducted,
// 		newBalance: currentBalance, // Top-level balance unchanged for entity-scoped
// 		newEntities,
// 		newAdjustment: currentAdjustment, // Top-level adjustment unchanged
// 		remaining: new Decimal(remaining).div(creditCost).toNumber(),
// 	};
// };
