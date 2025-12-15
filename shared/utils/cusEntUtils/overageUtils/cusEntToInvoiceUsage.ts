import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToStartingBalance } from "../balanceUtils/cusEntToStartingBalance";
import { isEntityScopedCusEnt } from "../classifyCusEntUtils";
import { cusEntToInvoiceOverage } from "./cusEntToInvoiceOverage";

export const cusEntToInvoiceUsage = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const startingBalance = cusEntToStartingBalance({ cusEnt });
	const invoiceOverage = cusEntToInvoiceOverage({ cusEnt });

	// 1. If invoice overage > 0:
	if (invoiceOverage > 0) {
		return new Decimal(startingBalance).add(invoiceOverage).toNumber();
	}

	// 1. If entity scoped
	if (isEntityScopedCusEnt({ cusEnt })) {
		let maxUsage = new Decimal(0);
		for (const [_, entity] of Object.entries(cusEnt.entities || {})) {
			const usage = new Decimal(startingBalance).sub(entity.balance);

			maxUsage = Decimal.max(maxUsage, usage);
		}

		return maxUsage.toNumber();
	}

	// 2. If not entity scoped
	const usage = new Decimal(startingBalance).sub(cusEnt.balance || 0);
	return usage.toNumber();
};
