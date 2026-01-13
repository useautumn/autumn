import type { Entitlement } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const performDeduction = ({
	cusEntBalance,
	toDeduct,
	ent,
	resetBalance,
	blockUsageLimit = true,
	allowNegativeBalance = false,
}: {
	cusEntBalance: Decimal;
	toDeduct: number;
	ent: Entitlement;
	resetBalance: number;
	blockUsageLimit?: boolean;
	allowNegativeBalance?: boolean;
}) => {
	// Either deduct from balance or entity balance
	if (allowNegativeBalance) {
		const usageLimit = ent.usage_limit;
		const minBalance = usageLimit
			? new Decimal(resetBalance).minus(usageLimit).toNumber()
			: undefined;

		let newBalance = cusEntBalance.minus(toDeduct).toNumber();

		if (
			blockUsageLimit &&
			minBalance &&
			new Decimal(newBalance).lt(minBalance)
		) {
			newBalance = minBalance;
			const deducted = new Decimal(cusEntBalance).minus(minBalance).toNumber();
			const toDeduct_ = new Decimal(toDeduct).minus(deducted).toNumber();
			return { newBalance, deducted, toDeduct: toDeduct_ };
		} else {
			const deducted = toDeduct;
			const toDeduct_ = 0;
			return { newBalance, deducted, toDeduct: toDeduct_ };
		}
	}

	if (cusEntBalance.lte(0) && toDeduct > 0) {
		return { newBalance: cusEntBalance.toNumber(), deducted: 0, toDeduct };
	}

	// If toDeduct is negative, add to balance and set toDeduct to 0
	let newBalance: number;
	let deducted: number;
	if (toDeduct < 0) {
		newBalance = cusEntBalance.minus(toDeduct).toNumber();
		deducted = toDeduct;
		toDeduct = 0;
	}

	// If cusEnt has less balance to deduct than 0, deduct the balance and set balance to 0
	else if (cusEntBalance.minus(toDeduct).lt(0)) {
		toDeduct = new Decimal(toDeduct).minus(cusEntBalance).toNumber(); // toDeduct = toDeduct - cusEntBalance
		deducted = cusEntBalance.toNumber(); // deducted = cusEntBalance
		newBalance = 0; // newBalance = 0
	} else {
		newBalance = cusEntBalance.minus(toDeduct).toNumber();
		deducted = toDeduct;
		toDeduct = 0;
	}

	return { newBalance, deducted, toDeduct };
};
