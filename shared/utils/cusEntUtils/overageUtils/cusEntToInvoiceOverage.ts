import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { isEntityScopedCusEnt } from "../classifyCusEntUtils";

export const cusEntToInvoiceOverage = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	// 1. If entity scoped
	if (isEntityScopedCusEnt(cusEnt)) {
		let totalOverage = new Decimal(0);
		for (const [_, entity] of Object.entries(cusEnt.entities || {})) {
			const overage = Decimal.max(0, new Decimal(-entity.balance));

			totalOverage = totalOverage.add(overage);
		}

		return totalOverage.toNumber(); // this is NOT to be used for any amount calculations OR billing calculations. ONLY display purposes (invoice descriptions)
	}

	// 2. If not entity scoped
	const overage = Decimal.max(0, new Decimal(-(cusEnt.balance || 0)));
	return overage.toNumber();
};
