import { Decimal } from "decimal.js";

type CalculateDeductionParams = {
	currentBalance: number;
	currentAdjustment: number;
	amountToDeduct: number;
	minBalance?: number; // undefined = no floor
	maxBalance?: number; // undefined = no ceiling
	alterGrantedBalance?: boolean;
};

type CalculateDeductionResult = {
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
	const isRefund = amountToDeduct < 0;

	let deducted: number;
	let newBalance: number;

	if (isRefund) {
		const amountToAdd = new Decimal(amountToDeduct).negated().toNumber();
		const maxAddable =
			maxBalance === undefined
				? amountToAdd
				: Math.max(
						0,
						new Decimal(maxBalance).sub(currentBalance).toNumber(),
					);
		const added = Math.min(amountToAdd, maxAddable);

		deducted = -added;
		newBalance = new Decimal(currentBalance).add(added).toNumber();
	} else {
		const maxDeductible =
			minBalance === undefined
				? amountToDeduct
				: Math.max(
						0,
						new Decimal(currentBalance).sub(minBalance).toNumber(),
					);
		deducted = Math.min(amountToDeduct, maxDeductible);
		newBalance = new Decimal(currentBalance).sub(deducted).toNumber();
	}

	const remaining = new Decimal(amountToDeduct).sub(deducted).toNumber();

	// Update adjustment if alterGrantedBalance is true
	let newAdjustment = currentAdjustment;
	if (alterGrantedBalance && deducted !== 0) {
		newAdjustment = new Decimal(currentAdjustment).sub(deducted).toNumber();
	}

	return { deducted, newBalance, newAdjustment, remaining };
};
