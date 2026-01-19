import { Decimal } from "decimal.js";

export type CalculateDeductionParams = {
	currentBalance: number;
	currentAdjustment: number;
	amountToDeduct: number;
	minBalance?: number; // undefined = no floor
	maxBalance?: number; // undefined = no ceiling
	alterGrantedBalance?: boolean;
};

export type CalculateDeductionResult = {
	deducted: number;
	newBalance: number;
	newAdjustment: number;
	remaining: number;
};

export const calculateDeduction = ({
	currentBalance,
	currentAdjustment,
	amountToDeduct,
	minBalance,
	maxBalance,
	alterGrantedBalance = false,
}: CalculateDeductionParams): CalculateDeductionResult => {
	let newBalance = new Decimal(currentBalance).sub(amountToDeduct).toNumber();

	// Apply floor (minBalance)
	if (minBalance !== undefined && newBalance < minBalance) {
		newBalance = minBalance;
	}

	// Apply ceiling (maxBalance) - for when adding credits
	if (maxBalance !== undefined && newBalance > maxBalance) {
		newBalance = maxBalance;
	}

	const deducted = new Decimal(currentBalance).sub(newBalance).toNumber();
	const remaining = new Decimal(amountToDeduct).sub(deducted).toNumber();

	// Update adjustment if alterGrantedBalance is true
	let newAdjustment = currentAdjustment;
	if (alterGrantedBalance && deducted !== 0) {
		newAdjustment = new Decimal(currentAdjustment).sub(deducted).toNumber();
	}

	return { deducted, newBalance, newAdjustment, remaining };
};
