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

	let newBalance: number;
	let deducted: number;
	if (toDeduct < 0) {
		newBalance = cusEntBalance.minus(toDeduct).toNumber();
		deducted = toDeduct;
		toDeduct = 0;
	} else if (cusEntBalance.minus(toDeduct).lt(0)) {
		toDeduct = new Decimal(toDeduct).minus(cusEntBalance).toNumber();
		deducted = cusEntBalance.toNumber();
		newBalance = 0;
	} else {
		newBalance = cusEntBalance.minus(toDeduct).toNumber();
		deducted = toDeduct;
		toDeduct = 0;
	}

	return { newBalance, deducted, toDeduct };
};
