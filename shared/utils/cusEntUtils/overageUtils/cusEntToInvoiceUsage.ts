import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntToStartingBalance } from "../balanceUtils/cusEntToStartingBalance";
import { isEntityScopedCusEnt } from "../classifyCusEntUtils";
import { cusEntToInvoiceOverage } from "./cusEntToInvoiceOverage";

export const cusEntToInvoiceUsage = ({
	cusEnt,
	subtractReplaceables = false,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	subtractReplaceables?: boolean;
}) => {
	const startingBalance = cusEntToStartingBalance({ cusEnt });
	const invoiceOverage = cusEntToInvoiceOverage({ cusEnt });

	if (invoiceOverage > 0) {
		const usage = new Decimal(startingBalance).add(invoiceOverage);

		if (subtractReplaceables) {
			const numReplaceables =
				cusEnt.replaceables?.filter((r) => r.delete_next_cycle).length ?? 0;
			const finalUsage = usage.sub(numReplaceables).toNumber();

			return Math.max(finalUsage, 0);
		}

		return usage.toNumber();
	}

	if (isEntityScopedCusEnt(cusEnt)) {
		let maxUsage = new Decimal(0);
		for (const [_, entity] of Object.entries(cusEnt.entities || {})) {
			const usage = new Decimal(startingBalance).sub(entity.balance);

			maxUsage = Decimal.max(maxUsage, usage);
		}

		return maxUsage.toNumber();
	}

	const usage = new Decimal(startingBalance).sub(cusEnt.balance || 0);

	return usage.toNumber();
};
